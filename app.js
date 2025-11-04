// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCWnB4VDxuH60J06E0XMGiNzD2m1Rq7HWw",
  authDomain: "team-builder-42438.firebaseapp.com",
  projectId: "team-builder-42438",
  storageBucket: "team-builder-42438.appspot.com", // <-- THIS IS THE FIX
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

    // --- Get references to HTML elements ---
    const fileInput = document.getElementById('csv-file-input');
    const importButton = document.getElementById('import-button');
    const exportButton = document.getElementById('export-button');
    const fileNameDisplay = document.getElementById('file-name-display');
    const rosterHeading = document.getElementById('roster-heading');
    const mainRosterList = document.getElementById('roster-list');
    const addTeamButton = document.getElementById('add-team-button');
    const teamGrid = document.getElementById('team-grid-dynamic');

    let chosenFile = null;

    // --- CSV Import / Export Listeners ---
    fileInput.addEventListener('change', (event) => {
        chosenFile = event.target.files[0];
        fileNameDisplay.textContent = chosenFile ? chosenFile.name : 'No file chosen';
    });
    importButton.addEventListener('click', () => {
        if (!chosenFile) return alert('Please select a CSV file first.');
        const reader = new FileReader();
        reader.onload = (event) => parseAndUpload(event.target.result);
        reader.onerror = () => alert('Error reading file.');
        reader.readAsText(chosenFile);
    });
    exportButton.addEventListener('click', exportRosterToCSV);

    // --- Team Listeners ---
    addTeamButton.addEventListener('click', addNewTeam);


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
                                team: 'unassigned'
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
                loadData();
            })
            .catch(error => console.error('FIREBASE IMPORT ERROR: ', error));
    }

    // --- CSV Export Function ---
    async function exportRosterToCSV() {
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
        } catch (error) { console.error('FIREBASE EXPORT ERROR: ', error); }
    }
    
    // --- Data Loading and Rendering ---

    async function loadData() {
        console.log("Attempting to load data from Firebase...");
        mainRosterList.innerHTML = '<li>Loading...</li>';
        teamGrid.innerHTML = '';
        
        let assignedCount = 0;
        let totalCount = 0;

        try {
            // 1. Load all teams
            const teamsSnapshot = await db.collection('teams').get();
            console.log(`Found ${teamsSnapshot.size} teams.`);
            
            // 2. Load all players
            const rosterSnapshot = await db.collection('roster').get();
            console.log(`Found ${rosterSnapshot.size} players.`);
            totalCount = rosterSnapshot.size;
            
            // 3. Map players to teams
            const playersByTeam = new Map();
            playersByTeam.set('unassigned', []);
            
            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                player.id = doc.id;
                const teamId = player.team || 'unassigned';
                
                if (!playersByTeam.has(teamId)) {
                    playersByTeam.set(teamId, []);
                }
                playersByTeam.get(teamId).push(player);

                if (teamId !== 'unassigned') {
                    assignedCount++;
                }
            });

            // 4. Render unassigned players
            mainRosterList.innerHTML = '';
            playersByTeam.get('unassigned').sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
                mainRosterList.appendChild(createPlayerLi(player));
            });

            // 5. Render teams
            teamsSnapshot.forEach(teamDoc => {
                const teamData = teamDoc.data();
                teamData.id = teamDoc.id;
                const teamPlayers = playersByTeam.get(teamData.id) || [];
                renderTeam(teamData, teamPlayers);
            });

            // 6. Update heading
            rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;
            console.log("Data loading and rendering complete.");
            
        } catch (error) {
            console.error("Error loading all data: ", error);
            mainRosterList.innerHTML = '<li>Error loading roster. Check Rules.</li>';
        }
    }

    function createPlayerLi(player) {
        const li = document.createElement('li');
        li.textContent = player.name;
        li.dataset.id = player.id;
        return li;
    }

    function renderTeam(teamData, teamPlayers) {
        const teamContainer = document.createElement('div');
        teamContainer.className = 'team-container';
        teamContainer.dataset.teamId = teamData.id; 

        const title = document.createElement('h3');
        title.setAttribute('contenteditable', 'true');
        title.textContent = teamData.name || 'New Team';
        title.addEventListener('blur', () => { 
            updateTeamData(teamData.id, { name: title.textContent });
        });

        const description = document.createElement('textarea');
        description.className = 'team-description';
        description.placeholder = 'Add description...';
        description.value = teamData.description || '';
        
        description.addEventListener('input', () => {
            description.style.height = 'auto'; 
            description.style.height = (description.scrollHeight) + 'px';
        });
        description.addEventListener('blur', () => {
            updateTeamData(teamData.id, { description: description.value });
        });
        setTimeout(() => description.dispatchEvent(new Event('input')), 0);

        const playerList = document.createElement('ul');
        playerList.className = 'roster-list-group';
        playerList.id = teamData.id; 
        
        teamPlayers.sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
            playerList.appendChild(createPlayerLi(player));
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-team-btn';
        deleteBtn.textContent = 'X';
        deleteBtn.addEventListener('click', () => deleteTeam(teamData.id, teamData.name));

        teamContainer.appendChild(deleteBtn);
        teamContainer.appendChild(title);
        teamContainer.appendChild(description);
        teamContainer.appendChild(playerList);
        
        teamGrid.appendChild(teamContainer);
    }
    
    function addNewTeam() {
        console.log("Adding new team...");
        db.collection('teams').add({
            name: "New Team",
            description: ""
        })
        .then(() => {
            console.log("Team added!");
            loadData(); 
        })
        .catch(error => console.error("Error adding team: ", error));
    }
    
    async function deleteTeam(teamId, teamName) {
        if (!confirm(`Are you sure you want to delete "${teamName}"? All players will be moved to the main roster.`)) {
            return;
        }
        
        console.log(`Deleting team ${teamId}...`);
        try {
            const playersQuery = db.collection('roster').where('team', '==', teamId);
            const playersSnapshot = await playersQuery.get();

            const batch = db.batch();

            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, { team: 'unassigned' });
            });
            
            const teamRef = db.collection('teams').doc(teamId);
            batch.delete(teamRef);
            
            await batch.commit();
            
            console.log("Team deleted and players moved.");
            loadData(); 
            
        } catch (error) {
            console.error("Error deleting team: ", error);
            alert("Error deleting team. Check console.");
        }
    }
    
    function updateTeamData(teamId, dataToUpdate) {
        db.collection('teams').doc(teamId).update(dataToUpdate)
            .then(() => console.log(`Team ${teamId} updated:`, dataToUpdate))
            .catch(error => console.error("Error updating team: ", error));
    }

    // --- Initial Page Load ---
    loadData();
});
