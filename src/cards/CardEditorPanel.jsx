import React from "react";
import { CardPreview } from "./CardPreview.jsx";

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
