# Vibey Build Instructions

## Important: This Extension Uses esbuild!

The Vibey extension uses **esbuild** to bundle all TypeScript files into a single `dist/extension.js` file. This means:

- ❌ `npm run compile` only compiles to `out/` folder (NOT used by the extension)
- ✅ `npm run esbuild` bundles to `dist/extension.js` (USED by the extension)

## Build Commands

### Development Build (with sourcemaps)
```bash
npm run esbuild
```

### Watch Mode (auto-rebuild on changes)
```bash
npm run esbuild-watch
```

### Production Build (minified)
```bash
npm run vscode:prepublish
```

## Testing Your Changes

After making code changes:

1. **Build the extension**
   ```bash
   npm run esbuild
   ```

2. **Reload the Extension Development Host**
   - In the Extension Development Host window (where you're testing)
   - Press `Ctrl+Shift+P`
   - Type "Reload Window"
   - Press Enter

3. **Check Debug Console**
   - In the main VS Code window (where you launched the debugger)
   - Go to the Debug Console tab
   - Look for `[VIBEY]` and `[MCP]` logs

## Common Mistakes

### ❌ Mistake: Running `npm run compile`
This compiles TypeScript but doesn't bundle the code. The extension won't use these changes.

### ✅ Correct: Running `npm run esbuild`
This bundles everything into `dist/extension.js` which the extension actually uses.

### ❌ Mistake: Editing files in `out/` or `dist/`
These are generated folders. Always edit files in `src/`.

### ✅ Correct: Edit `src/` then rebuild
1. Edit files in `src/`
2. Run `npm run esbuild`
3. Reload the extension

## Package.json Scripts Reference

```json
{
  "scripts": {
    "vscode:prepublish": "npm run esbuild-base -- --minify",
    "esbuild-base": "esbuild ./src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node",
    "esbuild": "npm run esbuild-base -- --sourcemap",
    "esbuild-watch": "npm run esbuild-base -- --sourcemap --watch",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package"
  }
}
```

## Debugging Tips

### Enable Watch Mode
For faster development, use watch mode:
```bash
npm run esbuild-watch
```

This will automatically rebuild whenever you save a file in `src/`.

### Check Bundle Size
After building, check the bundle size:
```bash
ls -lh dist/extension.js
```

Should be around 1-2 MB.

### Verify Your Changes Are Included
Search for a unique string from your changes:
```bash
Select-String -Path "dist/extension.js" -Pattern "your unique string"
```

## Publishing

Before publishing a new version:

1. **Update version in package.json**
2. **Build production bundle**
   ```bash
   npm run vscode:prepublish
   ```
3. **Package the extension**
   ```bash
   npm run package
   ```
4. **Test the .vsix file**
   - Install it in a clean VS Code instance
   - Verify all features work

## Troubleshooting

### Extension not picking up changes?
1. Verify you ran `npm run esbuild` (not `npm run compile`)
2. Check the timestamp on `dist/extension.js`
3. Reload the Extension Development Host window
4. Check for build errors in the terminal

### Build errors?
1. Check TypeScript errors: `npm run compile`
2. Fix any type errors
3. Then run `npm run esbuild`

### Extension crashes on startup?
1. Check the Debug Console for errors
2. Look for syntax errors in the bundled code
3. Try a clean build:
   ```bash
   rm -rf dist out
   npm run esbuild
   ```

