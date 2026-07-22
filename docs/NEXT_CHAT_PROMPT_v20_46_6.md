Construiesc un football board game. Lucrăm EXCLUSIV din build-ul:

Final_Board_v20_46_6_match_geometry_contours.zip

STADIUL CONFIRMAT

Single Player Match Presentation folosește randare separată pentru fill și contururile ariilor defensive.

În v20.46.6:
- jucătorii sunt pucuri circulare, fără tile/chenar pătrat local;
- fill-ul ariei rămâne sub puc;
- intersecțiile ariilor Blue/Red folosesc suprapunerea naturală a fill-urilor, fără diagonală artificială;
- conturul fiecărei arii este calculat exclusiv din geometria acelei arii, fără ca prezența unui jucător să creeze o gaură sau să suprime margini exterioare;
- celulele ocupate pot reda numai segmentele care sunt margini exterioare reale ale ariei;
- laturile interne nu sunt desenate, deci fundașii aflați în interior nu primesc pătrat;
- exemple vizuale urmărite: fundașii interiori fără pătrat; GK cu laturile exterioare stânga/dreapta închise, dar fără sus/jos când aria continuă; RW izolat cu contur exterior complet; la LM/RWB conturul ariei adverse se închide unde geometria o cere.

LIMITĂ STRICTĂ

Nu modifica Engine-ul, MatchState-ul, regulile sau geometria ariilor. Editor Mode și Manual Multiplayer trebuie să rămână neschimbate. Nu face refactorizare generală și nu adăuga override-uri CSS peste override-uri; investighează sursa înainte de orice schimbare.

Înainte de implementare, citește documentația relevantă și inspectează exact BoardCanvas.jsx și CSS-ul Match Presentation. Explică utilizatorului ce ai găsit înainte să modifici ceva.
