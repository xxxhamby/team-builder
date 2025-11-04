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
    const fileNameDisplay = document.getElementById('file-name-display');
    const rosterHeading = document.getElementById('roster-heading');
    
    // NEW: Get references to all our lists
    const rosterList = document.getElementById('roster-list');
    const moveSelectedButton = document.getElementById('move-selected-button');
    const teamLists = {
        'team-1': document.getElementById('team-1'),
        'team-2': document.getElementById('team-2'),
        'team-3': document.getElementById('team-3'),
        'team-4': document.getElementById('team-4'),
        'team-5': document.getElementById('team-5'),
        'team-6': document.getElementById('team-6')
    };

    let chosenFile = null;

    // --- CSV Import / Export Listeners ---
    fileInput.addEventListener('change', (event) => {
        chosenFile = event.target.files[0];
        fileNameDisplay.textContent = chosenFile ? chosenFile.name : 'No file chosen';
    });

    importButton.addEventListener('click', () => {
        if (!chosenFile) {
            alert('Please select a CSV file first.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => parseAndUpload(event.target.result);
        reader.onerror = () => alert('Error reading file.');
        reader.readAsText(chosenFile);
    });

    exportButton.addEventListener('click', exportRosterToCSV);

    // --- NEW: Multi-Select Logic ---
    rosterList.addEventListener('click', (event) => {
        const li = event.target.closest('li');
        if (!li) return; // Didn't click on a list item

        // Check for Ctrl key (Windows) or Meta key (Mac)
        if (event.ctrlKey || event.metaKey) {
            // Toggle selection
            li.classList.toggle('selected');
        } else {
            // Single select
            // Clear all other selections first
            document.querySelectorAll('#roster-list li.selected').forEach(item => {
                item.classList.remove('selected');
            });
            li.classList.add('selected');
        }
        
        // Show or hide the 'Move Selected' button
        updateMoveButtonVisibility();
    });

    // NEW: Move Selected Button Listener
    moveSelectedButton.addEventListener('click', () => {
        const selectedItems = document.querySelectorAll('#roster-list li.selected');
        if (selectedItems.length === 0) return;

        const teamNumber = prompt('Move selected players to which team (1-6)?');
        const teamId = `team-${teamNumber}`;

        if (!teamLists[teamId]) {
            alert('Invalid team number. Please enter a number from 1 to 6.');
            return;
        }

        const batch = db.batch();
        selectedItems.forEach(item => {
            const playerId = item.dataset.id; // Get ID from data attribute
            if (playerId) {
                const playerRef = db.collection('roster').doc(playerId);
                batch.update(playerRef, { team: teamId });
            }
        });

        batch.commit()
            .then(() => {
                console.log('Batch move successful!');
                loadRoster(); // Reload the entire UI
                updateMoveButtonVisibility(); // Hide button
            })
            .catch(error => {
                console.error('Error in batch move: ', error);
            });
    });

    function updateMoveButtonVisibility() {
        const selectedCount = document.querySelectorAll('#roster-list li.selected').length;
        moveSelectedButton.style.display = selectedCount > 0 ? 'block' : 'none';
        moveSelectedButton.textContent = `Move Selected (${selectedCount})`;
    }

    // --- CSV Parsing Function ---
    function parseAndUpload(csvData) {
        const rows = csvData.split('\n').map(row => row.trim());
        if (rows.length < 2) return alert('CSV file is empty.');

        const headerRow = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const playerIndex = headerRow.indexOf('Player');
        if (playerIndex === -1) return alert('Error: "Player" column not found.');

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
                            const playerDocId = cleanedName.replace(/\//g, '_');
                            const playerRef = db.collection('roster').doc(playerDocId);
                            batch.set(playerRef, {
                                name: cleanedName,
                                availability: 'Unknown',
                                team: 'unassigned' // Default to unassigned
                            });
                            playersAdded++;
                        }
                    }
                }
            }
        }
        if (playersAdded === 0) return alert('No valid players found.');

        batch.commit()
            .then(() => {
                alert(`Successfully imported ${playersAdded} players!`);
                loadRoster();
                fileNameDisplay.textContent = 'No file chosen';
                fileInput.value = '';
                chosenFile = null;
            })
            .catch(error => {
                console.error('FIREBASE IMPORT ERROR: ', error);
                alert('Error importing. Check console (F12) and Firebase Rules.');
            });
    }

    // --- NEW: Main Roster Loading Function ---
    function loadRoster() {
        console.log("Loading roster from Firebase...");
        
        // Clear all lists before loading
        rosterList.innerHTML = '<li>Loading...</li>';
        for (const list of Object.values(teamLists)) {
            list.innerHTML = '';
        }

        db.collection('roster').orderBy('name').get()
            .then(querySnapshot => {
                rosterList.innerHTML = ''; // Clear "Loading..."
                
                let totalCount = querySnapshot.size;
                let assignedCount = 0;
                let teamCounts = {};

                if (querySnapshot.empty) {
                    rosterHeading.textContent = 'My Roster (0 / 0)';
                    return;
                }

                querySnapshot.forEach(doc => {
                    const player = doc.data();
                    const playerId = doc.id; // The document ID (e.g., "chuina_portgasdace")
                    const playerTeam = player.team || 'unassigned';

                    // Create the list item
                    const li = document.createElement('li');
                    li.textContent = player.name;
                    // NEW: Add the database ID to the element!
                    // This is CRITICAL for drag-drop and multi-select.
                    li.dataset.id = playerId;

                    if (teamLists[playerTeam]) {
                        // Player is on a team
                        teamLists[playerTeam].appendChild(li);
                        assignedCount++;
                        // Add to team count
                        teamCounts[playerTeam] = (teamCounts[playerTeam] || 0) + 1;
                    } else {
                        // Player is on the main roster
                        rosterList.appendChild(li);
                    }
                });

                // Update roster heading
                rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;

                // Update all team headings
                for (const teamId in teamLists) {
                    const count = teamCounts[teamId] || 0;
                    document.getElementById(`${teamId}-heading`).textContent = `Team ${teamId.split('-')[1]} (${count})`;
                }
                
                console.log("Roster loaded successfully.");
            })
            .catch(error => {
                console.error('FIREBASE LOAD ERROR: ', error);
                rosterList.innerHTML = '<li>Error loading roster. Check Rules.</li>';
            });
    }

    // --- CSV Export Function ---
    async function exportRosterToCSV() {
        console.log("Export button clicked...");
        try {
            const querySnapshot = await db.collection('roster').orderBy('name').get();
            if (querySnapshot.empty) return alert('Roster is empty.');

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
        }
    }
    
    // --- NEW: Drag-and-Drop Initialization ---
    function initializeSortable() {
        const allLists = [rosterList, ...Object.values(teamLists)];
        
        allLists.forEach(listEl => {
            new Sortable(listEl, {
                group: 'roster-group', // All lists are part of the same group
                animation: 150,
                ghostClass: 'sortable-ghost', // The faded-out item
                
                // This event fires when you drop an item
                onEnd: function (evt) {
                    const itemEl = evt.item; // The <li> element that was moved
                    const newTeamId = evt.to.id; // The ID of the list it was dropped in
                    const playerId = itemEl.dataset.id; // The player's DB ID

                    if (!playerId) {
                        console.error('Error: Moved item has no player ID.');
                        return;
                    }
                    
                    // Determine new team status
                    const newTeam = (newTeamId === 'roster-list') ? 'unassigned' : newTeamId;

                    console.log(`Moving player ${playerId} to team ${newTeam}`);

                    // Update this one player in Firebase
                    db.collection('roster').doc(playerId).update({
                        team: newTeam
                    })
                    .then(() => {
                        console.log('Player team updated in Firebase.');
                        // Reload the counts on all headings
                        loadRoster(); 
                    })
                    .catch(error => {
                        console.error('Error updating player team: ', error);
                        // If it fails, reload anyway to put it back
                        loadRoster();
                    });
                }
            });
        });
    }

    // --- Initial Page Load ---
    loadRoster(); // Load the roster from DB
    initializeSortable(); // Activate drag-and-drop
});
