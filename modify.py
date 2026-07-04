from pathlib import Path
main_path=Path('/mnt/data/arrow_fix/src/main.jsx')
main=main_path.read_text()
main=main.replace('  function CardVisualCanvas({ card, side }) {','  function CardVisualCanvas({ card, side, editable = false }) {',1)
main=main.replace('''            className={`card-visual-zone card-visual-zone-${key}`}
            data-zone={key}''','''            className={`card-visual-zone card-visual-zone-${key} ${editable ? "is-editable" : ""}`}
            data-zone={key}''',1)
main=main.replace('''          >
            <span>{ZONE_LABELS[key] || key}</span>
          </div>''','''          >
            {editable ? <span>{ZONE_LABELS[key] || key}</span> : null}
          </div>''',1)
main=main.replace('<CardVisualCanvas card={card} side={shownSide} />','<CardVisualCanvas card={card} side={shownSide} editable={editableLayout} />',1)
old = r'''  function LayoutNumberInput({ value, onChange }) {
    return (
      <input
        className="layout-number-input"
        type="number"
        step="1"
        min="0"
        max="100"
        value={Math.round(Number(value) * 10) / 10}
        onChange={e => onChange(Number(e.target.value))}
      />
    );
  }

  function CardLayoutEditor({ card }) {
    const layout = normalizeCardVisualLayout(card.visualLayout || card.layout);
    const sides = [
      ["front", "Față"],
      ["back", "Verso"],
    ];
    return (
      <div className="card-edit-section card-layout-editor">
        <div className="card-edit-section-title">
          <strong>Layout Zones</strong>
          <button onClick={() => resetCardVisualLayout(card.id)}>Reset Layout</button>
        </div>
        <p className="layout-editor-note">Pasul 2: zonele sunt editabile numeric. Textul va fi legat în pasul următor.</p>
        {sides.map(([side, label]) => (
          <details key={side} open className="layout-side-editor">
            <summary>{label}</summary>
            <div className="layout-zone-table">
              <div className="layout-zone-head"><span>Zone</span><span>X</span><span>Y</span><span>W</span><span>H</span></div>
              {Object.entries(layout[side]).map(([zoneKey, box]) => (
                <div className="layout-zone-row" key={`${side}_${zoneKey}`}>
                  <strong>{ZONE_LABELS[zoneKey] || zoneKey}</strong>
                  <LayoutNumberInput value={box.x} onChange={value => updateCardVisualLayoutBox(card.id, side, zoneKey, { x: value })} />
                  <LayoutNumberInput value={box.y} onChange={value => updateCardVisualLayoutBox(card.id, side, zoneKey, { y: value })} />
                  <LayoutNumberInput value={box.w} onChange={value => updateCardVisualLayoutBox(card.id, side, zoneKey, { w: value })} />
                  <LayoutNumberInput value={box.h} onChange={value => updateCardVisualLayoutBox(card.id, side, zoneKey, { h: value })} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }'''
new = r'''  function LayoutArrowButton({ children, title, onClick }) {
    return (
      <button
        type="button"
        className="layout-arrow-btn"
        title={title}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }

  function nudgeLayoutBox(cardId, side, zoneKey, box, patch) {
    updateCardVisualLayoutBox(cardId, side, zoneKey, {
      x: patch.x ?? box.x,
      y: patch.y ?? box.y,
      w: patch.w ?? box.w,
      h: patch.h ?? box.h,
    });
  }

  function CardLayoutEditor({ card }) {
    const layout = normalizeCardVisualLayout(card.visualLayout || card.layout);
    const sides = [
      ["front", "Față"],
      ["back", "Verso"],
    ];
    const moveStep = 1;
    const sizeStep = 1;

    return (
      <div className="card-edit-section card-layout-editor">
        <div className="card-edit-section-title">
          <strong>Layout Zones</strong>
          <button type="button" onClick={() => resetCardVisualLayout(card.id)}>Reset Layout</button>
        </div>
        <p className="layout-editor-note">Zonele se mută și se redimensionează din săgeți. Chenarele apar doar în editor.</p>
        {sides.map(([side, label]) => (
          <details key={side} open className="layout-side-editor">
            <summary>{label}</summary>
            <div className="layout-zone-list">
              {Object.entries(layout[side]).map(([zoneKey, box]) => (
                <div className="layout-zone-row arrow-mode" key={`${side}_${zoneKey}`}>
                  <strong>{ZONE_LABELS[zoneKey] || zoneKey}</strong>

                  <div className="layout-arrow-group" aria-label="Poziție">
                    <span>Poziție</span>
                    <div className="layout-cross">
                      <LayoutArrowButton title="Mută sus" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { y: box.y - moveStep })}>↑</LayoutArrowButton>
                      <LayoutArrowButton title="Mută stânga" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { x: box.x - moveStep })}>←</LayoutArrowButton>
                      <LayoutArrowButton title="Mută dreapta" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { x: box.x + moveStep })}>→</LayoutArrowButton>
                      <LayoutArrowButton title="Mută jos" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { y: box.y + moveStep })}>↓</LayoutArrowButton>
                    </div>
                  </div>

                  <div className="layout-arrow-group" aria-label="Dimensiune">
                    <span>Dimensiune</span>
                    <div className="layout-size-grid">
                      <LayoutArrowButton title="Îngustează" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { w: box.w - sizeStep })}>W−</LayoutArrowButton>
                      <LayoutArrowButton title="Lărgește" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { w: box.w + sizeStep })}>W+</LayoutArrowButton>
                      <LayoutArrowButton title="Micșorează înălțimea" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { h: box.h - sizeStep })}>H−</LayoutArrowButton>
                      <LayoutArrowButton title="Mărește înălțimea" onClick={() => nudgeLayoutBox(card.id, side, zoneKey, box, { h: box.h + sizeStep })}>H+</LayoutArrowButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }'''
if old not in main:
    raise SystemExit('old block not found')
main=main.replace(old,new,1)
main_path.write_text(main)
css_path=Path('/mnt/data/arrow_fix/src/styles.css')
css=css_path.read_text()
css += r'''

/* USER FIX: zone frames only in Card Editor, never in Inspect / normal preview. */
.card-visual-zone {
  border: 0 !important;
  background: transparent !important;
  color: transparent !important;
  display: block !important;
  pointer-events: none !important;
}

.card-visual-zone.is-editable {
  border: 1px dashed rgba(255,255,255,.65) !important;
  background: rgba(0,0,0,.18) !important;
  color: rgba(255,255,255,.9) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  font-size: 7px !important;
  line-height: 1.05 !important;
  text-transform: uppercase !important;
  letter-spacing: .04em !important;
  padding: 2px !important;
}

/* USER FIX: replace numeric coordinates with arrow controls. */
.layout-zone-list {
  display: grid !important;
  gap: 8px !important;
}

.layout-zone-row.arrow-mode {
  display: grid !important;
  grid-template-columns: minmax(90px, 1fr) auto auto !important;
  gap: 10px !important;
  align-items: center !important;
  padding: 7px !important;
  border: 1px solid rgba(255,255,255,.1) !important;
  border-radius: 9px !important;
  background: rgba(0,0,0,.14) !important;
}

.layout-arrow-group {
  display: grid !important;
  gap: 4px !important;
  justify-items: center !important;
}

.layout-arrow-group > span {
  font-size: 10px !important;
  color: rgba(255,255,255,.62) !important;
  text-transform: uppercase !important;
  letter-spacing: .04em !important;
}

.layout-cross {
  display: grid !important;
  grid-template-columns: 30px 30px 30px !important;
  grid-template-rows: 26px 26px !important;
  gap: 3px !important;
}

.layout-cross .layout-arrow-btn:nth-child(1) { grid-column: 2 !important; grid-row: 1 !important; }
.layout-cross .layout-arrow-btn:nth-child(2) { grid-column: 1 !important; grid-row: 2 !important; }
.layout-cross .layout-arrow-btn:nth-child(3) { grid-column: 3 !important; grid-row: 2 !important; }
.layout-cross .layout-arrow-btn:nth-child(4) { grid-column: 2 !important; grid-row: 2 !important; }

.layout-size-grid {
  display: grid !important;
  grid-template-columns: 38px 38px !important;
  gap: 3px !important;
}

.layout-arrow-btn {
  min-width: 0 !important;
  width: 100% !important;
  min-height: 26px !important;
  padding: 3px 5px !important;
  border-radius: 7px !important;
  font-size: 12px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
}
'''
css_path.write_text(css)
