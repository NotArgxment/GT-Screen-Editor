Made with Claude Sonnet 5.5
# Screen Editor (Minecraft Forge 1.20.1)

## Photoshop-style interface:
- Toolbar (left): click an icon to add that element to the canvas.
- Options bar: X/Y/W/H of the selected element and align buttons relative to the screen.
- Rulers, 8 px grid, cursor coordinates and zoom (Ctrl+wheel).
- Layers panel: eye (hide, editor only), lock, move up/down, duplicate, delete.
- Properties / Screen / Code panel.
- Edit > Undo / Redo (Ctrl+Z / Ctrl+Y). Export/Import JSON; autosaved in the browser.

## Importing Java:
- Paste a Screen class anywhere in the editor (Ctrl+V), drop a .java file on the window, or use File > Import Java...
- render() and init() are converted into layers: fill, fillGradient, renderOutline, drawString/drawCenteredString, drawWordWrap,
  blit, renderItem, entity, tooltip zones, Button/ExtendedButton, EditBox, MultiLineEditBox, Checkbox, ForgeSlider, CycleButton, ImageButton.
- Class name, package, title, machine, pause flag and screen size (W/H constants) are read too.
- Coordinates may use left/top (or leftPos/topPos) plus constants and arithmetic. Anything it cannot understand is listed as "not imported".
- Local int variables (x, y, ly += 12...), named color constants (0xAARRGGBB) and ratio bars such as bw * (prog / (float) dur) are understood.
- if/else branches are flattened, so mutually exclusive texts can end up overlapping on the canvas; delete or move the extras.
- Choose "Replace" or "Add to current design". The import is one undo step (Ctrl+Z).

## Elements: 
Rectangle, Gradient, Outline, Progress bar, Vanilla panel, Text, Wrapped text, Texture, Item (with count),
Slot, Entity (player), Button, Image button, Cycle button, Slider (ForgeSlider), Text field, Text area,
Checkbox and Tooltip zone.

## Notes:
- Buttons, text fields, sliders, etc. are vanilla widgets and are drawn on top of everything else.
- A button's action runs on the client; to affect the machine you need a packet sent to the server.
- If the window is resized, init() recreates the widgets and the text typed into EditBoxes is lost.
- "Slot" only draws the slot background; a real inventory slot requires an AbstractContainerScreen and its Menu.
- The preview of text, items and the entity is approximate (it does not use Minecraft's font or models).
