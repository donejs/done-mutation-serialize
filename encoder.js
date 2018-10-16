const tags = require("./tags");
const NodeIndex = require("./index");

function* toUint8(n) {
	yield ((n >> 8) & 0xff); // high
	yield n & 0xff; // low
}

function* encodeString(text) {
	for(let i = 0, len = text.length; i < len; i++) {
		yield text.charCodeAt(i);
	}
	yield tags.Zero;
}

function* encodeType(val) {
	switch(typeof val) {
		case "boolean":
			yield 1;
			yield Number(val);
			break;
		case "number":
			yield 2;
			yield val|0;
			break;
		case "string":
			yield 3;
			yield* encodeString(val);
			break;
	}
}

function* encodeElement(element) {
	// Tag Name
	yield* encodeString(element.tagName.toLowerCase());

	// Attributes
	for(let attribute of element.attributes) {
		yield* encodeString(attribute.name);
		yield* encodeString(attribute.value);
	}
	yield tags.Zero;

	// Children
	let child = element.firstChild;
	while(child) {
		yield* encodeNode(child);
		child = child.nextSibling;
	}
	yield tags.Zero; // End of children
}

function* encodeNode(node) {
	yield node.nodeType;

	switch(node.nodeType) {
		case 1:
			yield* encodeElement(node);
			break;
		case 3:
			yield* encodeString(node.nodeValue);
			break;
		default:
			throw new Error(`Cannot yet encode nodeType ${node.nodeType}`);
	}
}

function* encodeRemovalMutation(node, parentIndex, childIndex) {
	yield tags.Remove;
	yield* toUint8(parentIndex);
	yield* toUint8(childIndex);
}

function* encodeAddedMutation(node, parentIndex) {
	yield tags.Insert;
	yield* toUint8(parentIndex);
	yield* toUint8(getChildIndex(node.parentNode, node)); // ref
	yield* encodeNode(node);
}

function* encodeCharacterMutation(node, parentIndex) {
	yield tags.Text;
	yield* toUint8(parentIndex);
	yield* encodeString(node.nodeValue);
}

function* encodeAttributeMutation(record, parentIndex) {
	let attributeValue = record.target.getAttribute(record.attributeName);
	if(attributeValue == null) {
		yield tags.RemoveAttr;
		yield* toUint8(parentIndex);
		yield* encodeString(record.attributeName);
	} else {
		yield tags.SetAttr;
		yield* toUint8(parentIndex);
		yield* encodeString(record.attributeName);
		yield* encodeString(attributeValue);
	}
}

function sortMutations(a, b) {
	let aType = a[0];
	let bType = b[0];
	let aIndex = a[1];
	let bIndex = b[1];

	if(aType === 0) {
		if(bType === 0) {
			let aChild = a[3];
			let bChild = b[3];

			if(aIndex >= bIndex) {
				if(aChild > bChild) {
					return -1;
				} else {
					return 1;
				}
			} else {
				return 1;
			}
		} else {
			return -1;
		}
	}
	else if(aType === 1) {
		if(aType === 1) {
			if(aIndex > bIndex) {
				return 1;
			} else {
				return -1;
			}
		} else {
			return -1;
		}
	}
	else {
		if(aType > bType) {
			return 1;
		} else {
			return -1;
		}
	}
}

class MutationEncoder {
	constructor(rootOrIndex) {
		if(rootOrIndex instanceof NodeIndex) {
			this.index = rootOrIndex;
		} else {
			this.index = new NodeIndex(rootOrIndex);
		}

		this._indexed = false;
	}

	encodeEvent(event) {
		return Uint8Array.from(this.event(event));
	}

	encode(records) {
		return Uint8Array.from(this.mutations(records));
	}

	*mutations(records) {
		const index = this.index;
		const removedNodes = new WeakSet();
		const instructions = [];

		let i = 0, iLen = records.length;
		let rangeStart = null, rangeEnd = null;

		//for(;i < iLen; i++) {
		while(i < iLen) {
			let record = records[i];
			let j, jLen;

			switch(record.type) {
				case "childList":
					// This adjusts the index so that we do removals in reverse order
					// Let's say we had an array of mutations like:
					// [{removedNodes:[1]}, {removedNodes:[2]}, {removedNodes:[3]}
					// {addedNodes:[1]}, {addedNodes:[2]}, {addedNodes:[3]}]
					// We want to do all of the removals first, in reverse order
					// And then proceed to the addedNode records.
					// This is achieved by keeping a start and end index for the
					// removal groupings
					if(isRemovalRecord(record)) {
						if(rangeStart == null) {
							rangeStart = i;
						}
						if(rangeEnd == null) {
							let nextRecord = records[i + 1];
							if(nextRecord && isRemovalRecord(nextRecord)) {
								i++;
								continue;
							} else {
								rangeEnd = i;
							}
						}
					}

					for(j = 0, jLen = record.removedNodes.length; j < jLen; j++) {
						let node = record.removedNodes[j];

						// If part of this set, it means that this node
						// was inserted and removed in the same Mutation event
						// in this case nothing needs to be encoded.
						if(removedNodes.has(node)) {
							continue;
						}

						let [parentIndex, childIndex] = index.fromParent(node);
						index.purge(node);
						instructions.push([0, parentIndex, encodeRemovalMutation(node, parentIndex, childIndex), childIndex]);

						/*let [parentIndex, childIndex] = index.fromParent(node);
						index.purge(node);
						yield tags.Remove;
						yield* toUint8(parentIndex);
						yield* toUint8(childIndex);*/
					}

					for (let node of record.addedNodes) {
						if(node.parentNode) {
							let parentIndex = index.for(node.parentNode);
							index.reIndexFrom(node);

							instructions.push([1, parentIndex, encodeAddedMutation(node, parentIndex)]);

							/*yield tags.Insert;
							yield* toUint8(parentIndex);
							yield* toUint8(getChildIndex(node.parentNode, node)); // ref
							yield* encodeNode(node);*/
						} else {
							// No parent means it was removed in the same mutation.
							// Add it to this set so that the removal can be ignored.
							removedNodes.add(node);
						}
					}

					break;
				case "characterData": {
					let node = record.target;
					let parentIndex = index.for(record.target);
					instructions.push([2, parentIndex, encodeCharacterMutation(node, parentIndex)]);
					/*yield tags.Text;
					yield* toUint8();
					yield* encodeString(record.target.nodeValue);*/
					break;
				}

				case "attributes": {
					let parentIndex = index.for(record.target);
					instructions.push([3, parentIndex, encodeAttributeMutation(record, parentIndex)]);
					break;
				}
			}

			// If there is no rangeStart/end proceed
			if(rangeStart == null && rangeEnd == null) {
				i++;
			} else {
				// If we have reached the first removal record
				// Then all removals have been processed and we can
				// skip ahead to the next non-removal record.
				if(i === rangeStart) {
					i = rangeEnd + 1;
					rangeStart = null;
					rangeEnd = null;
				}
				// Continue down to the next removal record.
				else {
					i--;
				}
			}
		}

		instructions.sort(sortMutations);
		for(let [,,gen] of instructions) {
			yield* gen;
		}
	}

	*event(event) {
		let index = this.index;
		switch(event.type) {
			case "change":
				yield tags.Prop;
				yield* toUint8(index.for(event.target));
				if(event.target.type === "checkbox") {
					yield* encodeString("checked");
					yield* encodeType(event.target.checked);
				} else {
					yield* encodeString("value");
					yield* encodeType(event.target.value);
				}
				break;
			default:
				throw new Error(`Encoding the event '${event.type}' is not supported.`);
		}
	}
}

function getChildIndex(parent, child) {
	let index = 0;
	let node = parent.firstChild;
	while(node) {
		if(node === child) {
			return index;
		}
		index++;
		node = node.nextSibling;
	}
	return -1;
}

function isRemovalRecord(record) {
	return record.removedNodes.length > 0 && record.addedNodes.length === 0;
}


module.exports = MutationEncoder;
