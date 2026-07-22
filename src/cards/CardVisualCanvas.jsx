import React, { useLayoutEffect, useRef, useState } from "react";

function AutoFitSpecialText({ children, style, className = "" }) {
  const textRef = useRef(null);
  const styleKey = JSON.stringify(style || {});

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return undefined;

    let frameId = 0;
    let cancelled = false;

    const setFitSize = size => {
      if (size == null) element.style.removeProperty("--special-fit-font-size");
      else element.style.setProperty("--special-fit-font-size", `${size}px`);
    };

    const fitText = () => {
      if (cancelled || !element.isConnected) return;

      setFitSize(null);
      const computed = window.getComputedStyle(element);
      const naturalSize = Number.parseFloat(computed.fontSize) || 3;
      const minimumSize = 3;
      const fits = () => (
        element.scrollHeight <= element.clientHeight + 0.5
        && element.scrollWidth <= element.clientWidth + 0.5
      );

      if (fits()) return;

      let low = minimumSize;
      let high = naturalSize;
      let best = minimumSize;

      for (let index = 0; index < 14; index += 1) {
        const candidate = (low + high) / 2;
        setFitSize(candidate);
        if (fits()) {
          best = candidate;
          low = candidate;
        } else {
          high = candidate;
        }
      }

      setFitSize(Math.max(minimumSize, best - 0.1));
    };

    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(fitText);
    };

    const observer = new ResizeObserver(scheduleFit);
    if (element.parentElement) observer.observe(element.parentElement);

    scheduleFit();
    if (document.fonts?.ready) document.fonts.ready.then(scheduleFit).catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [children, styleKey]);

  return <div ref={textRef} className={`card-zone-special ${className}`.trim()} style={style}>{children}</div>;
}

export function CardVisualCanvas({ card, side, showZones = false, selectedLayout = null, onSelectLayout = null, renderContext = {} }) {
  const {
    normalizeCardVisualLayout,
    cardTextColors,
    effectiveTextStylesForCard,
    safeColor,
    zoneTextStyleVars,
    normalizeFrontStars,
    zoneTextStyleVarsStable,
    cardLayoutTitle,
    zonePairDistanceVarsStable,
    normalizeStatValue,
    PREFERRED_FOOT_OPTIONS,
    colorToRgbTriplet,
    defensiveGridAdjustStyle,
    opponentGoalStyleVarsStable,
    normalizeCustomZones,
    clamp,
    updateCardVisualLayoutBox,
    updateCardCustomZoneBox,
    areaHasCell,
  } = renderContext;
  const canvasRef = useRef(null);
  const [activeLayoutEdit, setActiveLayoutEdit] = useState(null);
  const layout = normalizeCardVisualLayout(card?.visualLayout || card?.layout);
  const sideLayout = layout[side] || layout.back || {};
  const deletedLayoutSet = new Set(Array.isArray(card?.deletedLayoutZones) ? card.deletedLayoutZones.map(String) : []);
  const isSelectedLayout = (kind, zoneKey) => selectedLayout?.cardId === card?.id && selectedLayout?.side === side && selectedLayout?.kind === kind && selectedLayout?.zoneKey === zoneKey;

  const formatBoxCoordinates = box => `X ${Math.round(box.x * 10) / 10} · Y ${Math.round(box.y * 10) / 10} · W ${Math.round(box.w * 10) / 10} · H ${Math.round(box.h * 10) / 10}`;

  const colors = cardTextColors(card);
  const textStyles = effectiveTextStylesForCard(card);
  const visibleAttributes = (card?.passiveAttributes || []).filter(item => item.showOnCard !== false);
  const visibleBonuses = (card?.bonuses || []).filter(item => item.showOnCard !== false);

  const renderNameZone = colorKey => (
    <div className={`card-zone-text card-zone-name zone-color-bound ${colorKey === "headerFront" ? "card-zone-name-front" : ""}`} style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }} title={card?.name || "Player"}>
      {card?.name || "Player"}
    </div>
  );

  const renderPositionZone = colorKey => (
    <div className="card-zone-text card-zone-position zone-color-bound" style={{ "--zone-text-color": safeColor(colors[colorKey]), color: safeColor(colors[colorKey]), ...zoneTextStyleVars(textStyles, colorKey) }}>
      {String(card?.position || "").toUpperCase()}
    </div>
  );

  const renderFrontStars = () => {
    const stars = normalizeFrontStars(card?.starsFront);
    if (!stars.count) return null;
    return (
      <div
        className="card-zone-front-stars"
        style={{
          "--front-star-size": `${stars.size}px`,
          "--front-star-spacing": `${stars.spacing}px`,
          transform: `translate(${stars.x}px, ${stars.y}px)`,
        }}
        aria-label={`${stars.count} stars`}
      >
        {Array.from({ length: stars.count }, (_, index) => {
          const gradientId = `front-star-gold-${card?.id || "card"}-${index}`;
          return (
            <svg
              key={index}
              className="front-star-svg"
              viewBox="0 0 100 100"
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient id={gradientId} x1="50" y1="4" x2="50" y2="92" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#fff2a8" />
                  <stop offset="0.28" stopColor="#ffd45a" />
                  <stop offset="0.58" stopColor="#c88a12" />
                  <stop offset="1" stopColor="#6f4105" />
                </linearGradient>
              </defs>
              <polygon className="front-star-gold-base" fill={`url(#${gradientId})`} points="50,5 61,36 94,36 67,56 78,90 50,70 22,90 33,56 6,36 39,36" />
              <g className="front-star-facets">
                <polygon className="front-star-facet-light" points="50,5 50,50 39,36" />
                <polygon className="front-star-facet-dark" points="61,36 50,50 50,5" />
                <polygon className="front-star-facet-light" points="94,36 50,50 61,36" />
                <polygon className="front-star-facet-dark" points="67,56 50,50 94,36" />
                <polygon className="front-star-facet-dark" points="78,90 50,50 67,56" />
                <polygon className="front-star-facet-deep" points="50,70 50,50 78,90" />
                <polygon className="front-star-facet-deep" points="22,90 50,50 50,70" />
                <polygon className="front-star-facet-dark" points="33,56 50,50 22,90" />
                <polygon className="front-star-facet-dark" points="6,36 50,50 33,56" />
                <polygon className="front-star-facet-light" points="39,36 50,50 6,36" />
              </g>
            </svg>
          );
        })}        </div>
    );
  };

  const renderListZone = (items, colorKey, titleKey, titleColorKey) => {
    const textColor = safeColor(colors[colorKey]);
    const valueKey = `${colorKey}Value`;
    const valueColor = safeColor(colors[valueKey], textColor);
    const titleColor = safeColor(colors[titleColorKey]);
    return (
      <div className="card-zone-text card-zone-list-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": Math.max(2, items.length + 1), color: textColor }}>
        <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, titleColorKey) }}>{cardLayoutTitle(card, titleKey)}</div>
        <div className="card-zone-list" style={{ color: textColor, "--zone-lines": Math.max(2, items.length + 1), ...zoneTextStyleVarsStable(textStyles, colorKey), ...zonePairDistanceVarsStable(textStyles, colorKey, { longestLabelChars: Math.max(0, ...items.map(item => String(item.name || "").length)), maxValueChars: Math.max(1, ...items.map(item => String(normalizeStatValue(item.value)).length)) }) }}>
          {items.length ? items.map(item => (
            <div className="card-zone-list-row" key={item.id} style={{ color: textColor }}>
              <span className="card-zone-label" style={{ color: textColor }}>{item.name}</span>
              <strong className="card-zone-value" style={{ "--zone-number-color": valueColor, color: valueColor, ...zoneNumberStyleVarsStable(textStyles, colorKey, valueKey) }}>{normalizeStatValue(item.value)}</strong>
            </div>
          )) : <em style={{ color: textColor }}>—</em>}
        </div>
      </div>
    );
  };

  const renderSpecialAbilityZone = () => {
    const textColor = safeColor(colors.specialAbility);
    const titleColor = safeColor(colors.specialAbilityTitle);
    return (
      <div className="card-zone-text card-zone-special-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-title-color": titleColor, "--zone-lines": 3, color: textColor }}>
        <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, "specialAbilityTitle") }}>{cardLayoutTitle(card, "specialAbility")}</div>
        <AutoFitSpecialText style={{ color: textColor, ...zoneTextStyleVarsStable(textStyles, "specialAbility") }}>{card?.specialAbility || ""}</AutoFitSpecialText>
      </div>
    );
  };

  const renderPreferredFootZone = () => {
    const textColor = safeColor(colors.preferredFoot);
    const value = PREFERRED_FOOT_OPTIONS.includes(card?.preferredFoot) ? card.preferredFoot : "Right";
    return (
      <div className="card-zone-text card-zone-preferred-foot zone-color-bound" style={{ "--zone-text-color": textColor, color: textColor, ...zoneTextStyleVarsStable(textStyles, "preferredFoot") }}>
        <span style={{ color: textColor }}>Preferred Foot: {value}</span>
      </div>
    );
  };

  const renderDefensiveAreaZone = () => {
    const textColor = safeColor(colors.defensiveArea);
    const titleColor = safeColor(colors.defensiveAreaTitle);
    return (
      <div className="card-zone-text card-zone-defense-with-title zone-color-bound" style={{ "--zone-text-color": textColor, "--zone-text-rgb": colorToRgbTriplet(textColor), "--zone-title-color": titleColor, "--zone-lines": 2, color: textColor, "--card-area-active-color": safeColor(colors.defensiveAreaActive, "#50be78"), "--card-area-active-rgb": colorToRgbTriplet(colors.defensiveAreaActive, "#50be78") }}>
        <div className="card-zone-section-title" style={{ color: titleColor, ...zoneTextStyleVarsStable(textStyles, "defensiveAreaTitle") }}>{cardLayoutTitle(card, "defensiveArea")}</div>
        <div className="card-zone-defense card-zone-defense-row" style={{ color: textColor, ...zoneTextStyleVarsStable(textStyles, "defensiveArea") }}>
          <div className="card-zone-defense-grid-adjust" data-defensive-grid-card-id={card.id} style={defensiveGridAdjustStyle(card)}>
            <div className="card-zone-opponent-goal" data-defensive-goal-label-card-id={card.id} style={opponentGoalStyleVarsStable(textStyles)} aria-hidden="true">OPPONENT GOAL</div>
            <AreaMiniPreview area={card?.defensiveArea || []} areaHasCell={areaHasCell} />
          </div>
        </div>
      </div>
    );
  };


  const renderCustomZoneContent = () => <div className="card-zone-text card-zone-custom-empty" aria-hidden="true" />;

  const renderZoneContent = zoneKey => {
    if (side === "front") {
      if (zoneKey === "header") return renderNameZone("headerFront");
      if (zoneKey === "position") return renderPositionZone("positionFront");
      if (zoneKey === "attributes") return renderFrontStars();
    }
    if (zoneKey === "header") return renderNameZone("headerBack");
    if (zoneKey === "position") return renderPositionZone("positionBack");
    if (zoneKey === "attributes") return renderListZone(visibleAttributes, "attributes", "attributes", "attributesTitle");
    if (zoneKey === "bonuses") return renderListZone(visibleBonuses, "bonuses", "bonuses", "bonusesTitle");
    if (zoneKey === "specialAbility") return renderSpecialAbilityZone();
    if (zoneKey === "preferredFoot") return renderPreferredFootZone();
    if (zoneKey === "defensiveArea") return renderDefensiveAreaZone();
    return null;
  };

  const showLiveCoordinates = (zoneKey, box) => {
    setActiveLayoutEdit({ zoneKey, box: { ...box } });
  };

  const hideLiveCoordinates = () => {
    setActiveLayoutEdit(null);
  };

  const beginZoneEdit = (event, zoneKey, box, mode = "move", corner = "br") => {
    if (!showZones || !card?.id) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectLayout && onSelectLayout({ cardId: card.id, side, kind: "base", zoneKey });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBox = { ...box };
    const pointerId = event.pointerId;
    try { event.currentTarget.setPointerCapture?.(pointerId); } catch (_) {}
    showLiveCoordinates(zoneKey, startBox);

    const toPctX = px => (px / Math.max(rect.width, 1)) * 100;
    const toPctY = px => (px / Math.max(rect.height, 1)) * 100;

    const onMove = moveEvent => {
      moveEvent.preventDefault();
      const dx = toPctX(moveEvent.clientX - startX);
      const dy = toPctY(moveEvent.clientY - startY);
      let next = { ...startBox };

      if (mode === "move") {
        next.x = startBox.x + dx;
        next.y = startBox.y + dy;
      } else {
        if (corner.includes("r")) next.w = startBox.w + dx;
        if (corner.includes("l")) {
          next.x = startBox.x + dx;
          next.w = startBox.w - dx;
        }
        if (corner.includes("b")) next.h = startBox.h + dy;
        if (corner.includes("t")) {
          next.y = startBox.y + dy;
          next.h = startBox.h - dy;
        }
      }

      const bounded = {
        x: clamp(Number(next.x), 0, 100),
        y: clamp(Number(next.y), 0, 100),
        w: clamp(Number(next.w), 4, 100),
        h: clamp(Number(next.h), 4, 100),
      };
      bounded.w = Math.min(bounded.w, 100 - bounded.x);
      bounded.h = Math.min(bounded.h, 100 - bounded.y);
      showLiveCoordinates(zoneKey, bounded);
      updateCardVisualLayoutBox(card.id, side, zoneKey, bounded);
    };

    const onUp = () => {
      hideLiveCoordinates();
      try { event.currentTarget.releasePointerCapture?.(pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };

  const sideCustomZones = normalizeCustomZones(card).filter(zone => zone.side === side);

  const beginCustomZoneEdit = (event, zone, mode = "move", corner = "br") => {
    if (!showZones || !card?.id) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectLayout && onSelectLayout({ cardId: card.id, side, kind: "custom", zoneKey: zone.id });
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startBox = { ...zone.box };
    const pointerId = event.pointerId;
    try { event.currentTarget.setPointerCapture?.(pointerId); } catch (_) {}
    showLiveCoordinates(zone.id, startBox);

    const toPctX = px => (px / Math.max(rect.width, 1)) * 100;
    const toPctY = px => (px / Math.max(rect.height, 1)) * 100;

    const onMove = moveEvent => {
      moveEvent.preventDefault();
      const dx = toPctX(moveEvent.clientX - startX);
      const dy = toPctY(moveEvent.clientY - startY);
      let next = { ...startBox };
      if (mode === "move") {
        next.x = startBox.x + dx;
        next.y = startBox.y + dy;
      } else {
        if (corner.includes("r")) next.w = startBox.w + dx;
        if (corner.includes("l")) { next.x = startBox.x + dx; next.w = startBox.w - dx; }
        if (corner.includes("b")) next.h = startBox.h + dy;
        if (corner.includes("t")) { next.y = startBox.y + dy; next.h = startBox.h - dy; }
      }
      const bounded = {
        x: clamp(Number(next.x), 0, 100),
        y: clamp(Number(next.y), 0, 100),
        w: clamp(Number(next.w), 4, 100),
        h: clamp(Number(next.h), 4, 100),
      };
      bounded.w = Math.min(bounded.w, 100 - bounded.x);
      bounded.h = Math.min(bounded.h, 100 - bounded.y);
      showLiveCoordinates(zone.id, bounded);
      updateCardCustomZoneBox(card.id, zone.id, bounded);
    };

    const onUp = () => {
      hideLiveCoordinates();
      try { event.currentTarget.releasePointerCapture?.(pointerId); } catch (_) {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };

  const baseZoneEntries = Object.entries(sideLayout).filter(([key]) => !deletedLayoutSet.has(`${side}:${key}`));

  return (
    <div className="card-visual-canvas" data-card-side={side} ref={canvasRef} onPointerDown={event => { if (event.target === event.currentTarget) onSelectLayout && onSelectLayout(null); }}>
      {baseZoneEntries.map(([key, box]) => (
        <div
          key={`render_${side}_${key}`}
          className={`card-visual-zone card-visual-zone-${key}`}
          data-zone={key}
          style={{
            left: `${box.x}%`,
            top: `${box.y}%`,
            width: `${box.w}%`,
            height: `${box.h}%`,
          }}
        >
          <div className={`card-zone-content card-zone-content-${key}`}>{renderZoneContent(key)}</div>
        </div>
      ))}
      {sideCustomZones.map(zone => (
        <div
          key={`render_${side}_${zone.id}`}
          className="card-visual-zone card-visual-zone-custom"
          data-zone={zone.id}
          style={{
            left: `${zone.box.x}%`,
            top: `${zone.box.y}%`,
            width: `${zone.box.w}%`,
            height: `${zone.box.h}%`,
          }}
        >
          <div className="card-zone-content">{renderCustomZoneContent(zone)}</div>
        </div>
      ))}

      {showZones ? (
        <div className="card-editor-overlay-layer" aria-hidden="true">
          {baseZoneEntries.map(([key, box]) => (
            <div
              key={`edit_${side}_${key}`}
              className={`card-edit-overlay-zone card-edit-overlay-zone-${key} editable-zone ${isSelectedLayout("base", key) ? "selected-layout-zone" : ""}`}
              data-zone={key}
              onPointerDown={event => beginZoneEdit(event, key, box, "move")}
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.w}%`,
                height: `${box.h}%`,
              }}
            >
              {showZones && activeLayoutEdit?.zoneKey === key ? (
                <b className="zone-live-coordinates is-visible">{formatBoxCoordinates(activeLayoutEdit.box)}</b>
              ) : null}
              <i className="zone-resize-handle zone-resize-tl" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "tl")} />
              <i className="zone-resize-handle zone-resize-tr" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "tr")} />
              <i className="zone-resize-handle zone-resize-bl" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "bl")} />
              <i className="zone-resize-handle zone-resize-br" onPointerDown={event => beginZoneEdit(event, key, box, "resize", "br")} />
            </div>
          ))}
          {sideCustomZones.map(zone => (
            <div
              key={`edit_${side}_${zone.id}`}
              className={`card-edit-overlay-zone card-edit-overlay-zone-custom editable-zone ${isSelectedLayout("custom", zone.id) ? "selected-layout-zone" : ""}`}
              data-zone={zone.id}
              onPointerDown={event => beginCustomZoneEdit(event, zone, "move")}
              style={{
                left: `${zone.box.x}%`,
                top: `${zone.box.y}%`,
                width: `${zone.box.w}%`,
                height: `${zone.box.h}%`,
              }}
            >
              {showZones && activeLayoutEdit?.zoneKey === zone.id ? <b className="zone-live-coordinates is-visible">{formatBoxCoordinates(activeLayoutEdit.box)}</b> : null}
              <i className="zone-resize-handle zone-resize-tl" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "tl")} />
              <i className="zone-resize-handle zone-resize-tr" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "tr")} />
              <i className="zone-resize-handle zone-resize-bl" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "bl")} />
              <i className="zone-resize-handle zone-resize-br" onPointerDown={event => beginCustomZoneEdit(event, zone, "resize", "br")} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AreaMiniPreview({ area = [], areaHasCell }) {
  return <div className="area-mini">{Array.from({ length: 121 }, (_, i) => { const dx = (i % 11) - 5; const dy = Math.floor(i / 11) - 5; const center = dx === 0 && dy === 0; return <span key={i} className={`${center ? "player" : ""} ${areaHasCell(area, dx, dy) ? "active" : ""}`}>{center ? "" : ""}</span>; })}</div>;
}

