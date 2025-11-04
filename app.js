// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCWnB4VDxuH60J06E0XMGiNzD2m1Rq7HWw",
  authDomain: "team-builder-42438.firebaseapp.com",
  projectId: "team-builder-42438",
  storageBucket: "team-builder-42438.firebasestorage.app",
  messagingSenderId: "215714435049",
  appId: "1:215714435049:web:8b136178e7f8379bf90578",
  measurementId: "G-RJ0ZB7FJ0D"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Application Code ---
document.addEventListener('DOMContentLoaded', () => {

    const fileInput = document.getElementById('csv-file-input');
    const importButton = document.getElementById('import-button');
    const exportButton = document.getElementById('export-button');
    const rosterList = document.getElementById('roster-list');
    const fileNameDisplay = document.getElementById('file-name-display');

    let chosenFile = null;

    fileInput.addEventListener('change', (event) => {
        chosenFile = event.target.files[0];
        if (chosenFile) {
            fileNameDisplay.textContent = chosenFile.name;
        } else {
            fileNameDisplay.textContent = 'No file chosen';
        }
    });

    importButton.addEventListener('click', () => {
        if (!chosenFile) {
            alert('Please choose a CSV file first.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const csvData = event.target.result;
            parseAndUpload(csvData);
        };
        reader.readAsText(chosenFile);
    });

    exportButton.addEventListener('click', exportRosterToCSV);

    // --- Core Functions ---
    function parseAndUpload(csvData) {
        const rows = csvData.split('\n').map(row => row.trim());
        if (rows.length < 2) {
            alert('CSV file is empty or has no data rows.');
            return;
        }

        const headerRow = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const playerIndex = headerRow.indexOf('Player');
        
        if (playerIndex === -1) {
            alert('Error: Could not find a "Player" column in the CSV file. Check capitalization.');
            return;
        }

        const batch = db.batch();
        let playersAdded = 0;

        for (let i = 1; i < rows.length; i++) {
            if (rows[i]) { 
                const rowData = rows[i].split(',');
                // Check if the row has enough columns
                if (rowData.length > playerIndex) {
                    const playerName = rowData[playerIndex];
                    if (playerName) {
                        const cleanedName = playerName.trim().replace(/"/g, '');
                        if (cleanedName) {
                            const playerRef = db.collection('roster').doc(cleanedName);
                            batch.set(playerRef, {
                                name: cleanedName,
                                availability: 'Unknown'
                            });
                            playersAdded++;
                        }
                    }
                }
            }
        }

        if (playersAdded === 0) {
            alert('No valid player names were found in the file.');
            return;
        }

        batch.commit()
            .then(() => {
                alert(`Successfully imported ${playersAdded} players!`);
                loadRoster(); 
                fileNameDisplay.textContent = 'No file chosen';
                fileInput.value = ''; 
                chosenFile = null;
            })
            .catch(error => {
                console.error('Error importing roster: ', error);
                // NEW: More specific error
                alert('An error occurred while importing. Please check Firebase Security Rules.');
            });
    }

    function loadRoster() {
        rosterList.innerHTML = '<li>Loading...</li>';

        db.collection('roster').orderBy('name').get()
            .then(querySnapshot => {
                rosterList.innerHTML = ''; 
                
                if (querySnapshot.empty) {
                    rosterList.innerHTML = '<li>Roster is empty.</li>';
                    return;
                }

                querySnapshot.forEach(doc => {
                    const player = doc.data();
                    const li = document.createElement('li');
                    li.textContent = player.name;
                    rosterList.appendChild(li);
                });
            })
            .catch(error => {
                console.error('Error loading roster: ', error);
                // NEW: More specific error
                rosterList.innerHTML = '<li>Error loading roster. Please check Firebase Security Rules.</li>';
            });
    }

    async function exportRosterToCSV() {
        try {
            const querySnapshot = await db.collection('roster').orderBy('name').get();
            
            if (querySnapshot.empty) {
                alert('Roster is empty, nothing to export.');
                return;
            }

            let csvContent = "Name,Availability\n"; 

            querySnapshot.forEach(doc => {
                const player = doc.data();
                csvContent += `"${player.name}","${player.availability}"\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', 'roster_export.csv');
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click(); 
            document.body.removeChild(link); 

        } catch (error) {
            console.error('Error exporting roster: ', error);
            // NEW: More specific error
            alert('An error occurred while exporting. Please check Firebase Security Rules.');
        }
    }

    // --- Initial Page Load ---
    loadRoster(); 
});
