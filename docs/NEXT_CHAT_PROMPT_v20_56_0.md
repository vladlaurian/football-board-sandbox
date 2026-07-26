# Continuation prompt — v20.56.0

```text
Construiesc un football board game. Continuăm EXCLUSIV din buildul atașat:

Final_Board_v20_56_0_documentation_handoff.zip

Ești responsabil de continuitatea tehnică a proiectului. Nu pleca din v20.55.1, v20.55.2 sau dintr-un build vechi. v20.56.0 este baza curentă, dar conține două defecte Pass/Interception confirmate mai jos.

REGULI OBLIGATORII

- Nu implementezi nimic înainte să citești documentația relevantă, să inspectezi codul exact și să îmi prezinți analiza, contractul tehnic, fișierele afectate și planul. Aștepți aprobarea mea explicită.
- Nu faci refactorizare estetică, redenumiri preferențiale, mutări de cod sau reformatare fără scop architectural aprobat.
- Fiecare build are un obiectiv îngust, testabil independent.
- Dacă descoperi o problemă în afara scopului, o raportezi; nu o repari pe ascuns.
- UI proiectează starea și trimite comenzi. Engine/MatchState rămân autoritatea de gameplay.
- Timeline, Undo/Redo, Replay și AI Export folosesc aceeași stare canonică.
- MatchContext este înghețat la începutul meciului. Rule Set-ul activ din Editor nu este citit pentru un meci deja pornit.
- Prezentarea vizuală Match este înghețată în afara corecțiilor de proiecție explicite din scop.
- Manual Multiplayer trebuie să rămână complet neschimbat. Automated Multiplayer/Firebase authority sunt înghețate: nu le repari, nu le refactorizezi și nu le extinzi.
- La finalul unui build aprobat: rulezi testele și production build, dai teste manuale exacte, actualizezi documentația permanentă + CHANGELOG + README și livrezi ZIP extras direct la rădăcină, fără folder intermediar, fără node_modules/dist/.git/package-lock.
- Creezi următorul NEXT_CHAT_PROMPT numai dacă îți cer explicit.

CE CITEȘTI INTEGRAL ÎNAINTE DE ORICE ANALIZĂ

1. README.md
2. docs/DEVELOPMENT_WORKFLOW.md
3. docs/ARCHITECTURE_DECISIONS.md
4. docs/GAME_ENGINE_ARCHITECTURE.md
5. docs/GAME_ENGINE_MIGRATION_PLAN.md
6. docs/PHASE_9_PRE_MULTIPLAYER_ENGINE_AUDIT.md
7. docs/PERSONAL_ACTION_LIMITS.md
8. docs/RULE_SETS_EDITOR.md
9. docs/ACTION_RESOLUTION_ENGINE.md
10. docs/INTERCEPTION_ENGINE.md
11. docs/NEXT_CHAT_PROMPT_v20_56_0.md

STARE CONFIRMATĂ

- Runtime curent: v20.56.0.
- Single Player Match are Game Engine unic, MatchState canonic la cursorul Timeline și MatchContext înghețat pe meci.
- Phase 8, Phase 9, Phase 10A/10B și Phase 11 sunt acceptate ca boundary architectural. Nu le reauditezi fără legătură directă cu noua schimbare.
- Pass S/L, Through Ball și Lofted Through Ball sunt mecanici offline implementate. Bonus Action, pendingRoll, AV/AVM și 3/2 au fost recent reparate și sunt considerate stabile după ultimele teste. Nu le reînlocui cu ramuri UI locale.
- v20.56.0 a îmbunătățit proiecția Pass, dar NU este acceptat ca implementare finală pentru Long Pass/segmentare. Defectele de mai jos sunt confirmate.

REGULI PERMANENTE DE GEOMETRIE

- Distanțele, clasificarea Short/Long și poziția regulamentară a unui jucător folosesc centrul celulei.
- Colțul selectat reprezintă piciorul și traseul fizic al execuției. El poate schimba geometria traiectoriei, colțurile disponibile, corpul atins și celula defensivă traversată; nu schimbă distanța sau poziția corpului.
- Orice colț adiacent unui corp de coechipier sau adversar este indisponibil ca origine a execuției offline. Manual Multiplayer își păstrează regula veche.

SCOPE URMĂTOR — PROPUI ÎNAINTE DE IMPLEMENTARE

A. LONG PASS: INTERCEPȚIE ÎN ARII DEFENSIVE TRAVERSATE

Corecția de regulă este aceasta, nu o interpreta ca „aria trebuie să conțină exact celula pasatorului sau a țintei”.

- Long Pass este în aer prin mijlocul traseului: ariile/corpurile din mijlocul aerian nu produc intercepție.
- În zonele locale permise de reacție de la origine și destinație, aceeași regulă de bază ca la Short Pass se aplică pe fiecare celulă de arie defensivă traversată de traiectoria fizică.
- Dacă mingea intră într-o celulă a ariei defensive a unui apărător și apărătorul poate ajunge la minge în acea celulă fără ca traseul apărător → minge să fie blocat de corpul unui adversar, acel apărător trebuie să fie interceptor eligibil.
- Un corp lateral/adiacent nu blochează. Blochează numai dacă segmentul real apărător → punctul mingii traversează celula corpului.
- Interceptorii de origine se rezolvă înaintea celor de destinație. Ei formează aceeași secvență progresivă: stack-ul și orice Natural-1 carry continuă până la capul global.
- Contactul direct al mingii cu un adversar înainte de ținta aleasă are prioritate și nu mai cere un roll redundant.
- Nu inventa un număr fix de celule pentru delimitarea „mijlocului aerian” fără să explici mai întâi cum este definită în regula existentă. Dacă documentația și codul nu o fac neambiguă, oprește-te și cere-mi doar această clarificare.

Defect confirmat: v20.56.0 caută încă dacă aria defensivă conține celula-ancoră de origine/destinație. Astfel ratează un CB ale cărui celule defensive sunt efectiv traversate. În exemplele testate, mingea intră evident în aria CB-ului, CB are traseu liber la acea celulă, deci trebuie să apară roll de Interception.

B. SEGMENTAREA TRASEULUI PASS

- Fiecare colț produce propria traiectorie și propria evaluare de contact.
- Dacă o traiectorie atinge un alt corp înainte de ținta aleasă: segment colorat până la corp (roșu pentru adversar, verde pentru coechipier), apoi gri de la contact spre ținta cerută; mingea de la ținta cerută este gri.
- Corpul jucătorului-țintă ales NU este contact intermediar. O rută normală spre ținta aleasă rămâne colorată până la el, fără coadă gri în celula lui.
- Dacă, dintre patru colțuri, numai una trece printr-un adversar, numai aceea este roșu → gri. Celelalte trei rămân verzi până la țintă.
- Badge-ul de origine și segmentul colorat trebuie să consume același verdict canonic; UI nu deduce risc/clear separat.
- Aceasta este o corecție Engine plan/projection, nu CSS cosmetic și nu o recalculezi în main.jsx.

C. MATCH MODE → EDITOR MODE

Înainte de ieșire trebuie să existe un dialog de siguranță:

"Exit Match Mode and return to Editor? Match play will stop."

- Cancel: nu schimbă nimic.
- Continue: abia apoi urmează dialogul actual de Save / Switch Without Saving atunci când meciul are modificări nesalvate.
- Nu modifica Timeline, MatchContext, Manual Multiplayer sau comportamentul Editor dincolo de această tranziție.

CE INSPECȚIONEZI EXACT

- src/rules/passEngine.mjs: geometrie, traversed defensive cells, body contact, eligibilitate Long/Short;
- src/engine/passStartRules.mjs: plan canonic, routePresentation, confirmare și priorități;
- src/engine/matchPresentationSelectors.mjs: proiecția oficială;
- src/main.jsx: doar consumatorii de proiecție/segmentare și fluxul Match → Editor;
- testele Pass/Interception existente;
- MatchState / MatchContext / Timeline / AI export pentru orice fapt nou persistat.

ÎNAINTE DE APROBARE, SPUNE-MI ÎN ROMÂNĂ

1. ce produce concret defectul Long Pass în cod și de ce nu intră CB-ul eligibil în listă;
2. definiția exactă propusă pentru zonele de reacție Long Pass și ce clarificare este necesară dacă nu poate fi dedusă fără a inventa regulă;
3. schema canonică a celulelor traversate, punctelor de reacție și interceptorilor;
4. de ce segmentarea actuală pune gri la ținta aleasă și cum va diferenția ținta de un contact intermediar;
5. fluxul de confirmare Match → Editor;
6. modulele afectate;
7. testele automate și manuale;
8. confirmare explicită că Manual Multiplayer rămâne neatins.

Nu scrii cod până nu îți aprob explicit planul.
```
