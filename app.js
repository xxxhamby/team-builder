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
    console.log("DOM fully loaded and parsed");

    // Get references to HTML elements
    const fileInput = document.getElementById('csv-file-input');
    const importButton = document.getElementById('import-button');
    const exportButton = document.getElementById('export-button');
    const rosterList = document.getElementById('roster-list');
    const fileNameDisplay = document.getElementById('file-name-display');
    const rosterHeading = document.getElementById('roster-heading');
    // const teamsHeading = document.getElementById('teams-heading'); // Ready for later

    let chosenFile = null;

    // Listen for when a file is chosen
    fileInput.addEventListener('change', (event) => {
        chosenFile = event.target.files[0];
        if (chosenFile) {
            console.log("File chosen:", chosenFile.name);
            fileNameDisplay.textContent = chosenFile.name;
        } else {
            console.log("File selection cancelled.");
            fileNameDisplay.textContent = 'No file chosen';
        }
    });

    // Listen for click on the Import button
    importButton.addEventListener('click', () => {
        console.log("Import button clicked.");
        if (!chosenFile) {
            alert('Please select a CSV file first.');
            console.log("Import failed: No file chosen.");
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(event) {
            const csvData = event.target.result;
            console.log("File read successfully, now parsing...");
            parseAndUpload(csvData);
        };
        reader.onerror = function() {
            alert('Error reading file.');
            console.error("FileReader error.");
        };
        reader.readAsText(chosenFile);
    });

    // Listen for click on the Export button
    exportButton.addEventListener('click', exportRosterToCSV);

    // --- Core Functions ---
    function parseAndUpload(csvData) {
        const rows = csvData.split('\n').map(row => row.trim());
        if (rows.length < 2) {
            alert('CSV file is empty or has no data rows.');
            return;
        }

        const headerRow = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        console.log("CSV Headers found:", headerRow);
        
        const playerIndex = headerRow.indexOf('Player');
        
        if (playerIndex === -1) {
            alert('Error: Could not find a "Player" column in the CSV file. Check capitalization.');
            console.error("Parsing error: 'Player' column not found.");
            return;
        }
        console.log("Found 'Player' column at index:", playerIndex);

        const batch = db.batch();
        let playersAdded = 0;

        for (let i = 1; i < rows.length; i++) {
            if (rows[i]) { 
                const rowData = rows[i].split(',');
                if (rowData.length > playerIndex) {
                    const playerName = rowData[playerIndex];
                    if (playerName) {
                        const cleanedName = playerName.trim().replace(/"/g, '');
                        if (cleanedName) {
                            const playerRef = db.collection('roster').doc(cleanedName);
                            
                            // NEW: We add a 'team' field
                            batch.set(playerRef, {
                                name: cleanedName,
                                availability: 'Unknown',
                                team: 'unassigned' // NEW: For assigned counter
                            });
                            playersAdded++;
                        }
                    }
                }
            }
        }

        if (playersAdded === 0) {
            alert('No valid player names were found in the file.');
            console.log("Import complete, but 0 players were added.");
            return;
        }
        
        console.log(`Committing batch for ${playersAdded} players...`);

        batch.commit()
            .then(() => {
                alert(`Successfully imported ${playersAdded} players!`);
                console.log("Batch commit successful!");
                loadRoster(); // Reload the list
                fileNameDisplay.textContent = 'No file chosen';
                fileInput.value = ''; 
                chosenFile = null;
            })
            .catch(error => {
                console.error('FIREBASE IMPORT ERROR: ', error);
                alert('An error occurred while saving to the database. PLEASE CHECK FIREBASE RULES and browser console (F12) for details.');
            });
    }

    /**
     * Fetches all documents from the "roster" collection and displays them
     */
    function loadRoster() {
        console.log("Loading roster from Firebase...");
        rosterList.innerHTML = '<li>Loading...</li>';

        db.collection('roster').orderBy('name').get()
            .then(querySnapshot => {
                rosterList.innerHTML = ''; 
                
                let totalCount = querySnapshot.size;
                let assignedCount = 0;

                if (querySnapshot.empty) {
                    rosterList.innerHTML = '<li>Roster is empty.</li>';
                    rosterHeading.textContent = 'My Roster (0 / 0)';
                    return;
                }

                querySnapshot.forEach(doc => {
                    const player = doc.data();
                    
                    // NEW: Check if player is assigned
                    if (player.team && player.team !== 'unassigned') {
                        assignedCount++;
                    }

                    const li = document.createElement('li');
                    li.textContent = player.name;
                    rosterList.appendChild(li);
                });

                // NEW: Update roster heading
                rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;
                console.log("Roster loaded successfully.");

            })
            .catch(error => {
                console.error('FIREBASE LOAD ERROR: ', error);
                rosterList.innerHTML = '<li>Error loading roster. Check Firebase Rules and console (F12).</li>';
            });
    }

    async function exportRosterToCSV() {
        console.log("Export button clicked, fetching roster...");
        try {
            const querySnapshot = await db.collection('roster').orderBy('name').get();
            
            if (querySnapshot.empty) {
                alert('Roster is empty, nothing to export.');
                return;
            }

            // NEW: Export includes 'team'
            let csvContent = "Name,Availability,Team\n"; 

            querySnapshot.forEach(doc => {
                const player = doc.data();
                csvContent += `"${player.name}","${player.availability}","${player.team || 'unassigned'}"\n`;
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
            console.log("Export successful.");

        } catch (error) {
            console.error('FIREBASE EXPORT ERROR: ', error);
            alert('An error occurred while exporting. Check console (F12).');
        }
    }

    // --- Initial Page Load ---
    loadRoster(); 
});
