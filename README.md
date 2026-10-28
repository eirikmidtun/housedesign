# Husdesign

A warm, friendly web app for designing your home in 3D.

The work happens in steps:

1. **Floor plan (2D)** – get the apartment outline right: rooms, wall lengths, doors and windows. *(available now)*
2. **3D view** – look around the apartment built from the floor plan, with a cut-away mode that lowers the walls. *(available now)*
3. **Furniture** – upload, drop or paste a photo, paste a link, or start from a shape (sofa, bed, table…). The app makes a simple model in the real size and colour, which you can drag around in 3D or on the floor plan, turn, resize and duplicate. *(available now; detailed AI-generated models are a possible next step)*

## Using the floor plan editor

- Click a room to select it. Drag the room to move it, drag a white corner to reshape it, and drag the orange `+` on a wall to add a corner. Double-click a corner to remove it.
- Corners shared with neighbouring rooms move together. Hold **Shift** to move just one.
- Type exact wall lengths in the sidebar; the wall stretches and lined-up corners follow.
- **Room**, **Door** and **Window** tools add new things (shortcuts `R`, `D`, `W`, `V` for select).
- **Floors:** add floors above or a basement from the floor switcher or the *Floors* panel. Each floor has its own rooms, furniture, ceiling height and drawing. The floor below shows as dashed lines, and an empty floor can copy the walls of the one below. The 3D view stacks the floors and hides the ones above the floor you pick.
- **Floor plan drawings (plantegning):** *Upload floor plan* takes a photo, image or PDF (pick the page for multi-page PDFs; PDFs start out at 1:100). *Move* drags it into place (or Shift-drag on a computer), *Rotate* turns it, and *Set scale* lets you click two points and type their real distance. Then trace the rooms with the Room tool.
- Undo/redo with `Ctrl+Z` / `Ctrl+Shift+Z`. The plan is saved in the browser automatically and can be exported as JSON.

## Development

```bash
npm install
npm run dev
```

`npm run build` produces a static site in `dist/`. Pushing to `main` deploys it on Vercel.
