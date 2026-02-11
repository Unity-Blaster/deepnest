# Deepnest Changelong
(newest on top, breaking changes)

2026-02-10 Version 1.5.10
           Fixed macOS build issue by downgrading runner to macos-12.
           Added "Shortcuts" tab to sidebar with detailed help content.
           Improved text labels: Segoe UI, thin weight, better sizing logic, square alignment fix.
           Optimized Add Sheet dialog: removed animation and focus delay.
           Fixed layout shift on Windows when opening sheet dialog.
           Added keyboard navigation for Quantity fields ('q', Tab/Shift+Tab, Esc/Enter).
           Added "Check added sheets (after first)" setting.

2026-02-10 Version 1.5.9
           Disabled startup notifications popup.
           Added scrollbar to #nestinfo in Nest View.
           Added keyboard navigation for Quantity fields ('q', Tab/Shift+Tab, Esc/Enter).
           Added "Check added sheets (after first)" setting.
           Improved text labels: Segoe UI, thin weight, better sizing logic, square alignment fix.
           Optimized Add Sheet dialog: removed animation and focus delay.
           Increased quantity input width to 4rem.
           Fixed layout shift on Windows when opening sheet dialog.

2026-02-10 Version 1.5.8
           Fixed 'a' key shortcut in Main View (Select All).
           Added 's' key shortcut in Nest View (Toggle Start/Stop).
           Improved Export Dropdown visibility/toggle behavior.
           Refined dynamic font sizing for text labels to account for rotation.
           Set DXF export properties: Layer "Layer 1", Color 7 (White), Linetype ByLayer.

2026-02-10 Version 1.5.7
           Added keyboard shortcuts for Main View: 'n' (New Sheet), 'a' (Select All), 's' (Start Nest), 'i' (Import).
           Added keyboard shortcuts for Nest View: 'a'/'s' (Stop/Start), 'b' (Back), 'e' (Export menu), '1'/'2'/'3' (Export SVG/DXF/JSON).
           Added text labels to parts in Nest View and Exports showing index and dimensions.
           Fixed DXF export to include text labels and position origin at bottom-left.
           Improved text label visibility with dynamic sizing and counter-rotation.

2023-05-15 rename `npm run` scripts: fullbuild->build-all, fullclean->clean-all
           introduced dist-all that includes a full clean rebuild with dist
2023-05-14 removed all `npm run` hardcoded filesystem references to `Dogthemachine`
           aliased the w:* commands to *
2023-05-13  `npm run w:dist` now overwrites an existent dist directory of the same name

### Code changes from cmidgley fork

Aside from improving the ability to build (mostly in `binding.gyp`, `package.json`, and
`README.md`), the following changes have also been made:

- Cloned the `plus.svg` file into `add_sheet.svg` (it was missing) for the add-sheet icon.
- Added environment variable `deepnest_debug` to open the browser dev tools (see [Browser dev
  tools](#browser-dev-tools)).
- Checked for thrown errors on a couple paths that would cause expections when closing the
  application while the nest was still running.  A better solution would be to cleanly shutdown the
  workers when the app is closed, but this works for now (but could hide important exceptions).
  The two places are marked with a `// todo:` comment in `main.js`.
- Removed a bunch of unused source files.  There are likely more to be discovered.  There also
  appears to be code that is unused within the source files.
- Eliminated the dependency on a manually downloaded instance of boost (completion of work from
  prior fork, using the `polygon` sub-repo).
- Removed all build artifacts.  This means there is no pre-built binaries in this fork and a build
  is required in order to use this.  Eventually a cleaner release solution, perhaps with ZIP or an installer,
  should be added along with making releases offical in GitHub.
- Bumped the version number to 1.0.6cm (the 'cm' to indicate this has come from the `cmidgley`
  fork).
- Eliminated the dependency on the `c:\nest` directory pre-existing, instead using the os-specific temp directory
  (`os.tmpdir()`) and creating it if it does not exist.  
- Clarified the license is MIT.  Removed an old reference to GPL and added the `license` property to
  `package.json`.  Moved the `LICENSE.txt` file to the root and renamed to `LICENSE`.
