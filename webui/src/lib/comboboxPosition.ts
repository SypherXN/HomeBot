export type ComboboxMenuPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

/** Position a fixed combobox menu so it stays inside the visible viewport (keyboard-safe). */
export function measureComboboxMenu(anchor: HTMLElement): ComboboxMenuPos {
  const r = anchor.getBoundingClientRect();
  const gap = 4;
  const maxH = 280;
  const vv = window.visualViewport;
  const viewportTop = vv?.offsetTop ?? 0;
  const viewportLeft = vv?.offsetLeft ?? 0;
  const viewportHeight = vv?.height ?? window.innerHeight;
  const viewportWidth = vv?.width ?? window.innerWidth;
  const viewportBottom = viewportTop + viewportHeight;
  const viewportRight = viewportLeft + viewportWidth;

  const spaceBelow = viewportBottom - r.bottom - gap;
  const spaceAbove = r.top - viewportTop - gap;
  const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
  const maxHeight = Math.max(120, Math.min(maxH, openUp ? spaceAbove : spaceBelow));

  let top = openUp ? r.top - maxHeight - gap : r.bottom + gap;
  top = Math.max(viewportTop + gap, Math.min(top, viewportBottom - maxHeight - gap));

  const width = Math.min(Math.max(r.width, 220), viewportWidth - 16);
  let left = Math.max(viewportLeft + 8, r.left);
  left = Math.min(left, viewportRight - width - 8);

  return { top, left, width, maxHeight, openUp };
}
