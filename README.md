# Football Board Sandbox v3.0

- Firebase conectat
- Login cu Google / Logout
- Formațiile și situațiile de joc se salvează și în cloud când apeși Save
- Buton Cloud Save pentru snapshot complet
- La login, aplicația încarcă datele din cloud; dacă nu există cloud data, urcă datele locale curente
- localStorage rămâne fallback pentru utilizare fără login

IMPORTANT: Firestore rules trebuie să permită userului autentificat să citească/scrie doar în propriul nod `/users/{uid}`.
