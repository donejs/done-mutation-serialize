# done-mutation

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/donejs/done-mutation/blob/master/LICENSE)
[![npm version](https://badge.fury.io/js/done-mutation.svg)](https://www.npmjs.com/package/done-mutation)
[![Build Status](https://travis-ci.org/donejs/done-mutation.svg?branch=master)](https://travis-ci.org/donejs/done-mutation) [![Greenkeeper badge](https://badges.greenkeeper.io/donejs/done-mutation.svg)](https://greenkeeper.io/)

Utilties for encoding, decoding, and patching MutationRecords.

## Usage

### ES6 use

With StealJS, you can import this module directly in a template that is autorendered:

```js
import plugin from 'done-mutation';
```

### CommonJS use

Use `require` to load `done-mutation` and everything else
needed to create a template that uses `done-mutation`:

```js
var plugin = require("done-mutation");
```

### Standalone use

Load the `global` version of the plugin:

```html
<script src='./node_modules/done-mutation/dist/global/done-mutation.js'></script>
```
