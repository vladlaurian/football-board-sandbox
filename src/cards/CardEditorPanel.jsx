import React, { useEffect, useState } from "react";
import { CardPreview } from "./CardPreview.jsx";

// This stateful editor must live at module scope.  When it was declared in
// the App shell, every card-field update created a new component type and
// React remounted its inputs, losing focus and the controls' scroll position.
export function CardStarMenuEditor({ cardId, stars, onUpdate }) {
  const [starRangeDraft, setStarRangeDraft] = useState({});
  useEffect(() => setStarRangeDraft({}), [cardId]);
  const controls = [
    { key: "count", label: "Stars", min: 0, max: 10, step: 1 },
    { key: "size", label: "Size", min: 4, max: 80, step: 1 },
    { key: "spacing", label: "Spacing", min: 0, max: 80, step: 1 },
    { key: "x", label: "X", min: -120, max: 120, step: 1 },
    { key: "y", label: "Y", min: -120, max: 120, step: 1 },
  ];
  const clampStarValue = (control, rawValue) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return Number(stars?.[control.key] || 0);
    return Math.min(control.max, Math.max(control.min, numericValue));
  };
  const displayStarValue = control => starRangeDraft[control.key] ?? stars?.[control.key] ?? 0;
  const commitStarValue = (control, rawValue) => {
    const clampedValue = clampStarValue(control, rawValue);
    setStarRangeDraft(prev => ({ ...prev, [control.key]: clampedValue }));
    onUpdate({ [control.key]: clampedValue });
  };
  const nudgeStarValue = (control, delta) => commitStarValue(control, Number(displayStarValue(control) || 0) + (delta * control.step));
  const stopControlEvent = event => event.stopPropagation();
  return (
    <div className="card-edit-section star-menu-section">
      <div className="card-edit-section-title"><strong>Star Menu</strong></div>
      <div className="star-menu-controls star-menu-controls-compact">
        {controls.map(control => (
          <div key={control.key} className="star-control-compact">
            <span className="star-control-label">{control.label}</span>
            <div className="star-control-inline">
              <button type="button" className="star-control-step" onClick={() => nudgeStarValue(control, -1)} aria-label={`Decrease ${control.label}`}>−</button>
              <input
                className="star-control-range"
                type="range"
                min={control.min}
                max={control.max}
                step={control.step}
                value={displayStarValue(control)}
                onPointerDown={stopControlEvent}
                onMouseDown={stopControlEvent}
                onTouchStart={stopControlEvent}
                onInput={event => commitStarValue(control, event.currentTarget.value)}
                onPointerUp={event => commitStarValue(control, event.currentTarget.value)}
                onPointerCancel={event => commitStarValue(control, event.currentTarget.value)}
                onMouseUp={event => commitStarValue(control, event.currentTarget.value)}
                onTouchEnd={event => commitStarValue(control, event.currentTarget.value)}
                onBlur={event => commitStarValue(control, event.currentTarget.value)}
                onKeyUp={event => {
                  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter"].includes(event.key)) commitStarValue(control, event.currentTarget.value);
                }}
                aria-label={control.label}
              />
              <button type="button" className="star-control-step" onClick={() => nudgeStarValue(control, 1)} aria-label={`Increase ${control.label}`}>+</button>
            </div>
            <input
              className="star-control-number"
              type="number"
              min={control.min}
              max={control.max}
              step={control.step}
              value={displayStarValue(control)}
              onPointerDown={stopControlEvent}
              onMouseDown={stopControlEvent}
              onTouchStart={stopControlEvent}
              onChange={event => commitStarValue(control, event.currentTarget.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// The application shell owns the Card Editor state and mutations. This panel
// owns the editor form composition only, so it cannot create a second card
// library or Match-data path.
export function CardEditorPanel({ card, controller }) {
  if (!card) return <div className="empty-panel">Alege sau creează un card.</div>;

  const {
    renderContext,
    renderLayoutEditor,
    renderColorPicker,
    renderTextStyleControls,
    renderStarMenu,
    renderSectionTitleEditor,
    renderAttributeListEditor,
    renderDefensiveGridAdjustControl,
    renderOpponentGoalTextControl,
    renderDefensiveAreaEditor,
    updateCardField,
    positionOptions,
    preferredFootOptions,
  } = controller;

  const renderPositionSelect = () => (
    <select value={card.position} onChange={event => updateCardField(card.id, "position", event.target.value)}>
      {positionOptions.map(position => <option key={position} value={position}>{position}</option>)}
    </select>
  );

  return (
    <div className="card-editor">
      <div className="card-editor-previews">
        <div><div className="card-preview-label">Front</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="front" showLayoutZones={true} renderContext={renderContext} /></div></div>
        <div><div className="card-preview-label">Back</div><div className="card-render-shell"><CardPreview card={card} team="neutral" side="back" showLayoutZones={true} renderContext={renderContext} /></div></div>
      </div>
      <div className="card-editor-controls">
        {renderLayoutEditor(card)}
        <label>Name<input value={card.name} onChange={event => updateCardField(card.id, "name", event.target.value)} /></label>
        <div className="card-edit-section compact-color-row"><strong>Header Front</strong>{renderColorPicker(card, "headerFront", "Color")}{renderTextStyleControls(card, "headerFront", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Front</strong>{renderColorPicker(card, "positionFront", "Color")}{renderTextStyleControls(card, "positionFront", false, { panelAlign: "front" })}</div>{renderPositionSelect()}</div>
        {renderStarMenu(card)}
        <div className="card-edit-section compact-color-row"><strong>Header Back</strong>{renderColorPicker(card, "headerBack", "Color")}{renderTextStyleControls(card, "headerBack", false, { panelAlign: "front" })}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Position Back</strong>{renderColorPicker(card, "positionBack", "Color")}{renderTextStyleControls(card, "positionBack", false, { panelAlign: "front" })}</div>{renderPositionSelect()}</div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Attributes</strong></div>{renderSectionTitleEditor(card, "attributes", "attributesTitle", "Title")}{renderAttributeListEditor(card, "passiveAttributes", "Attributes", <>{renderColorPicker(card, "attributes", "Text Color")}{renderTextStyleControls(card, "attributes", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "attributesValue", "Numbers Color")}{renderTextStyleControls(card, "attributesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</>)}</div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Bonuses</strong></div>{renderSectionTitleEditor(card, "bonuses", "bonusesTitle", "Title")}{renderAttributeListEditor(card, "bonuses", "Bonuses", <>{renderColorPicker(card, "bonuses", "Text Color")}{renderTextStyleControls(card, "bonuses", false, { panelAlign: "left", buttonLabel: "Text" })}{renderColorPicker(card, "bonusesValue", "Numbers Color")}{renderTextStyleControls(card, "bonusesValue", false, { panelAlign: "left", buttonLabel: "Numbers", numbersMode: true })}</>)}</div>
        <div className="card-edit-section editor-position-section"><div className="card-edit-section-title"><strong>Preferred Foot</strong>{renderColorPicker(card, "preferredFoot", "Color")}{renderTextStyleControls(card, "preferredFoot", false, { panelAlign: "left", buttonLabel: "Text", hideLine: true, fontSizeMin: 20 })}</div><select value={preferredFootOptions.includes(card.preferredFoot) ? card.preferredFoot : "Right"} onChange={event => updateCardField(card.id, "preferredFoot", event.target.value)}>{preferredFootOptions.map(foot => <option key={foot} value={foot}>{foot}</option>)}</select></div>
        <div className="card-edit-section special-ability-editor"><div className="card-edit-section-title"><strong>Special Ability</strong></div>{renderSectionTitleEditor(card, "specialAbility", "specialAbilityTitle", "Title")}<div className="special-text-toolbar">{renderColorPicker(card, "specialAbility", "Text Color")}{renderTextStyleControls(card, "specialAbility", false, { panelAlign: "left", inlinePanel: true })}</div><textarea className="special-ability-textarea" value={card.specialAbility || ""} onChange={event => updateCardField(card.id, "specialAbility", event.target.value)} placeholder="Write special ability text..." /></div>
        <div className="card-edit-section"><div className="card-edit-section-title"><strong>Defensive Area</strong>{renderColorPicker(card, "defensiveArea", "Grid")}{renderColorPicker(card, "defensiveAreaActive", "Selected Area")}{renderDefensiveGridAdjustControl(card)}{renderOpponentGoalTextControl(card)}</div>{renderSectionTitleEditor(card, "defensiveArea", "defensiveAreaTitle", "Title")}{renderDefensiveAreaEditor(card)}</div>
      </div>
    </div>
  );
}
