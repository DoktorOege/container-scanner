# Container-Scanner & 3D-Planer

Seecontainer mit dem Handy vermessen, Wände fotografieren und in 3D umgestalten und einrichten.

**App:** https://doktoroege.github.io/container-scanner/

## Teile
- `scan.html` – AR-Scanner (Chrome auf Android mit ARCore): Ecken, Höhe, Fenster/Türen, Wandfotos
- `index.html` – 3D-Planer: Maße, Farben, Fenster/Türen, Möbel, Foto-Oberflächen, Import fremder 3D-Scans (GLB/OBJ/PLY/STL)
- `scan-core.js` – Vermessung und Projektion der Fotos auf die Wände
- `idb.js` – Speicher im Browser (IndexedDB), über den Scanner und Planer Daten austauschen

Alle Daten bleiben auf dem Gerät.
