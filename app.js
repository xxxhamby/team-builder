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

let sortableInstances = [];
// NEW: Variable to track which player was clicked
let currentlyClickedPlayerId = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");
    console.log("Using Project ID:", firebaseConfig.projectId); 

    // --- Get references to HTML elements ---
    const fileInput = document.getElementById('csv-file-input');
    const importButton = document.getElementById('import-button');
    const exportButton = document.getElementById('export-button');
    const clearTeamsButton = document.getElementById('clear-teams-button');
    const fileNameDisplay = document.getElementById('file-name-display');
    const rosterHeading = document.getElementById('roster-heading');
    const mainRosterList = document.getElementById('roster-list');
    const addTeamButton = document.getElementById('add-team-button');
    const teamGrid = document.getElementById('team-grid-dynamic');
    
    // NEW: Get context menu and its buttons
    const contextMenu = document.getElementById('context-menu');
    const setRoleGroupLeader = document.getElementById('set-role-group_leader');
    const setRoleRallyLeader = document.getElementById('set-role-rally_leader');
    const setRoleMember = document.getElementById('set-role-member');

    let chosenFile = null;

    // --- Main Listeners ---
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
    addTeamButton.addEventListener('click', addNewTeam);
    clearTeamsButton.addEventListener('click', clearAllTeams);

    // --- NEW: Context Menu Listeners ---
    
    // Function to show the context menu
    const showContextMenu = (event) => {
        event.preventDefault(); // Stop browser right-click menu
        
        const li = event.target.closest('.player-li');
        if (!li) return; // Didn't click on a player

        currentlyClickedPlayerId = li.dataset.id; // Store which player we clicked
        
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
    };
    
    // Add right-click listener to both list areas
    mainRosterList.addEventListener('contextmenu', showContextMenu);
    teamGrid.addEventListener('contextmenu', showContextMenu);
    
    // Hide context menu when clicking anywhere else
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        currentlyClickedPlayerId = null;
    });

    // Listeners for the menu buttons
    setRoleGroupLeader.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'group_leader');
    });
    setRoleRallyLeader.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'rally_leader');
    });
    setRoleMember.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'member');
    });

    // --- CSV Parsing Function ---
    function parseAndUpload(csvData) {
        // (Unchanged, but now adds 'role: member' by default)
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
                                team: 'unassigned',
                                role: 'member' // Default role
                            });
                            playersAdded++;
                        }
                    }
                }
            }
        }
        if (playersAdded === 0) return alert('No valid players found.');
        
        batch.commit()
            .then(() => { alert(`Successfully imported ${playersAdded} players!`); loadData(); })
            .catch(error => console.error('FIREBASE IMPORT ERROR: ', error));
    }

    // --- CSV Export Function ---
    async function exportRosterToCSV() {
        try {
            const querySnapshot = await db.collection('roster').orderBy('name').get();
            if (querySnapshot.empty) return alert('Roster is empty.');
            
            // UPDATED: Export includes new role name
            let csvContent = "Name,Availability,Team,Role\n";
            querySnapshot.forEach(doc => {
                const player = doc.data();
                csvContent += `"${player.name}","${player.availability}","${player.team || 'unassigned'}","${player.role || 'member'}"\n`;
            });
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'roster_export_full.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) { console.error('FIREBASE EXPORT ERROR: ', error); }
    }
    
    // --- Data Loading and Rendering ---
    async function loadData() {
        console.log("Loading data...");
        sortableInstances.forEach(instance => instance.destroy());
        sortableInstances = [];
        
        mainRosterList.innerHTML = '<li>Loading...</li>';
        teamGrid.innerHTML = '';
        
        let assignedCount = 0;
        let totalCount = 0;

        try {
            const teamsSnapshot = await db.collection('teams').get();
            const rosterSnapshot = await db.collection('roster').get();
            totalCount = rosterSnapshot.size;
            
            const playersByTeam = new Map();
            playersByTeam.set('unassigned', []);
            
            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                player.id = doc.id;
                const teamId = player.team || 'unassigned';
                
                if (!playersByTeam.has(teamId)) playersByTeam.set(teamId, []);
                playersByTeam.get(teamId).push(player);
                if (teamId !== 'unassigned') assignedCount++;
            });

            mainRosterList.innerHTML = '';
            playersByTeam.get('unassigned').sort((a,b) => a.name.localeCompare(b.name)).forEach(player => {
                mainRosterList.appendChild(createPlayerLi(player));
            });

            teamsSnapshot.forEach(teamDoc => {
                const teamData = teamDoc.data();
                teamData.id = teamDoc.id;
                const teamPlayers = playersByTeam.get(teamData.id) || [];
                renderTeam(teamData, teamPlayers);
            });

            rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;
            console.log("Data loading complete.");
            
            initializeSortable();

        } catch (error) { console.error("Error loading all data: ", error); }
    }

    /**
     * UPDATED: Creates player <li> with new role name
     */
    function createPlayerLi(player) {
        const li = document.createElement('li');
        li.className = 'player-li';
        li.dataset.id = player.id;
        
        const icon = document.createElement('span');
        icon.className = 'player-icon';
        
        const role = player.role || 'member';
        
        if (role === 'group_leader') { // UPDATED
            li.classList.add('role-group_leader');
            icon.textContent = '👑';
        } else if (role === 'rally_leader') { // UPDATED
            li.classList.add('role-rally_leader');
            icon.textContent = '⚔️';
        } else {
            li.classList.add('role-member');
        }
        
        const name = document.createTextNode(` ${player.name}`);
        li.appendChild(icon);
        li.appendChild(name);
        return li;
    }

    /**
     * UPDATED: Sorts players by new role name
     */
    function sortPlayers(a, b) {
        const roleOrder = { 'group_leader': 1, 'rally_leader': 2, 'member': 3 }; // UPDATED
        
        const roleA = roleOrder[a.role || 'member'];
        const roleB = roleOrder[b.role || 'member'];

        if (roleA !== roleB) return roleA - roleB;
        return a.name.localeCompare(b.name);
    }

    /**
     * Renders team. Note: Role change listener is REMOVED from here.
     */
    function renderTeam(teamData, teamPlayers) {
        const teamContainer = document.createElement('div');
        teamContainer.className = 'team-container';
        teamContainer.dataset.teamId = teamData.id; 

        const title = document.createElement('h3');
        title.setAttribute('contenteditable', 'true');
        title.textContent = teamData.name || 'New Team';
        title.addEventListener('blur', () => updateTeamData(teamData.id, { name: title.textContent }));

        const description = document.createElement('textarea');
        description.className = 'team-description';
        description.placeholder = 'Add description...';
        description.value = teamData.description || '';
        description.addEventListener('input', () => {
            description.style.height = 'auto'; 
            description.style.height = (description.scrollHeight) + 'px';
        });
        description.addEventListener('blur', () => updateTeamData(teamData.id, { description: description.value }));
        setTimeout(() => description.dispatchEvent(new Event('input')), 0);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-team-btn';
        deleteBtn.textContent = 'X';
        deleteBtn.addEventListener('click', () => deleteTeam(teamData.id, teamData.name));

        const playerList = document.createElement('ul');
        playerList.className = 'roster-list-group';
        playerList.id = teamData.id;
        
        teamPlayers.sort(sortPlayers).forEach(player => { // Sorting is still here
            playerList.appendChild(createPlayerLi(player));
        });
        
        // The click listener that used prompt() has been removed.

        teamContainer.appendChild(deleteBtn);
        teamContainer.appendChild(title);
        teamContainer.appendChild(description);
        teamContainer.appendChild(playerList);
        
        teamGrid.appendChild(teamContainer);
    }

    // --- NEW: Helper function to update a player's role ---
    function updatePlayerRole(playerId, newRole) {
        console.log(`Setting player ${playerId} to role ${newRole}`);
        db.collection('roster').doc(playerId).update({ role: newRole })
            .then(() => {
                console.log("Role updated!");
                loadData(); // Reload to show the change
            })
            .catch(error => console.error("Error updating role: ", error));
    }
    
    // --- Team CRUD Functions ---
    function addNewTeam() {
        db.collection('teams').add({ name: "New Team", description: "" })
            .then(() => loadData())
            .catch(error => console.error("Error adding team: ", error));
    }
    
    async function deleteTeam(teamId, teamName) {
        if (!confirm(`Are you sure you want to delete "${teamName}"?`)) return;
        try {
            const playersQuery = db.collection('roster').where('team', '==', teamId);
            const playersSnapshot = await playersQuery.get();
            const batch = db.batch();
            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, { team: 'unassigned', role: 'member' });
            });
            const teamRef = db.collection('teams').doc(teamId);
            batch.delete(teamRef);
            await batch.commit();
            loadData();
        } catch (error) { console.error("Error deleting team: ", error); }
    }
    
    function updateTeamData(teamId, dataToUpdate) {
        db.collection('teams').doc(teamId).update(dataToUpdate)
            .then(() => console.log(`Team ${teamId} updated`))
            .catch(error => console.error("Error updating team: ", error));
    }

    async function clearAllTeams() {
        if (!confirm('Are you sure you want to clear all teams? All players will be moved back to the main roster and roles will be reset.')) return;
        
        console.log("Clearing all teams and resetting roles...");
        try {
            const playersQuery = db.collection('roster').where('team', '!=', 'unassigned');
            const playersSnapshot = await playersQuery.get();
            if (playersSnapshot.empty) {
                alert("All players are already unassigned.");
                return;
            }
            const batch = db.batch();
            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, { team: 'unassigned', role: 'member' });
            });
            await batch.commit();
            console.log(`Moved ${playersSnapshot.size} players to unassigned.`);
            loadData();
        } catch (error) { console.error("Error clearing teams: ", error); }
    }

    // --- Drag-and-Drop Initialization ---
    function initializeSortable() {
        const lists = document.querySelectorAll('.roster-list-group');
        lists.forEach(list => {
            const sortable = new Sortable(list, {
                group: 'roster-group',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    const playerId = evt.item.dataset.id;
                    const newTeamListId = evt.to.id;
                    const newTeam = (newTeamListId === 'roster-list') ? 'unassigned' : newTeamListId;
                    
                    console.log(`Moving player ${playerId} to team ${newTeam}`);
                    db.collection('roster').doc(playerId).update({ team: newTeam })
                        .then(() => {
                            console.log("Player team updated successfully.");
                            loadData();
                        })
                        .catch(error => {
                            console.error("Error updating player team: ", error);
                            loadData(); 
                        });
                }
            });
            sortableInstances.push(sortable);
        });
        console.log(`Initialized drag-and-drop on ${lists.length} lists.`);
    }

    // --- Initial Page Load ---
    loadData();
});
