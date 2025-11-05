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
let currentlyClickedPlayerId = null;
let activeEventId = null;
let allEventIds = [];

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
    const contextMenu = document.getElementById('context-menu');
    const setRoleGroupLeader = document.getElementById('set-role-group_leader');
    const setRoleRallyLeader = document.getElementById('set-role-rally_leader');
    const setRoleMember = document.getElementById('set-role-member');
    const eventSelector = document.getElementById('event-selector');
    
    // NEW: Modal and Loading elements
    const helpButton = document.getElementById('help-button');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const loadingContainer = document.getElementById('loading-container');
    const mainContent = document.getElementById('main-content');
    const deletePlayerButton = document.getElementById('delete-player'); // NEW

    let chosenFile = null;

    // --- Main Listeners ---
    fileInput.addEventListener('change', (event) => {
        chosenFile = event.target.files[0];
        fileNameDisplay.textContent = chosenFile ? chosenFile.name : 'No file chosen';
    });
    importButton.addEventListener('click', () => {
        if (!activeEventId) return alert("Please wait for events to load.");
        if (!chosenFile) return alert('Please select a CSV file first.');
        const reader = new FileReader();
        reader.onload = (event) => parseAndUpload(event.target.result);
        reader.onerror = () => alert('Error reading file.');
        reader.readAsText(chosenFile);
    });
    exportButton.addEventListener('click', exportRosterToCSV);
    addTeamButton.addEventListener('click', addNewTeam);
    clearTeamsButton.addEventListener('click', clearAllTeams);
    eventSelector.addEventListener('change', () => {
        activeEventId = eventSelector.value;
        console.log(`Active event changed to: ${activeEventId}`);
        loadData();
    });

    // --- Modal Listeners ---
    helpButton.addEventListener('click', () => {
        modalOverlay.style.display = 'flex';
    });
    modalCloseBtn.addEventListener('click', () => {
        modalOverlay.style.display = 'none';
    });
    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    });

    // --- Context Menu Listeners ---
    const showContextMenu = (event) => {
        event.preventDefault();
        const li = event.target.closest('.player-li');
        if (!li) return;
        currentlyClickedPlayerId = li.dataset.id;
        contextMenu.style.display = 'block';
        contextMenu.style.left = `${event.pageX}px`;
        contextMenu.style.top = `${event.pageY}px`;
    };
    mainRosterList.addEventListener('contextmenu', showContextMenu);
    teamGrid.addEventListener('contextmenu', showContextMenu);
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
        currentlyClickedPlayerId = null;
    });
    setRoleGroupLeader.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'group_leader');
    });
    setRoleRallyLeader.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'rally_leader');
    });
    setRoleMember.addEventListener('click', () => {
        if (currentlyClickedPlayerId) updatePlayerRole(currentlyClickedPlayerId, 'member');
    });
    // NEW: Delete Player listener
    deletePlayerButton.addEventListener('click', () => {
        if (currentlyClickedPlayerId) deletePlayer(currentlyClickedPlayerId);
    });


    // --- CSV Parsing Function ---
    async function parseAndUpload(csvData) {
        // (This function is unchanged from the last working version)
        const rows = csvData.split('\n').map(row => row.trim());
        if (rows.length < 2) return alert('CSV file is empty.');
        const headerRow = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const playerIndex = headerRow.indexOf('Player');
        if (playerIndex === -1) return alert('Error: "Player" column not found.');
        alert('Importing players... This may take a moment as we set up all event presets.');
        const batch = db.batch();
        let playersAdded = 0;
        const defaultAssignments = {};
        allEventIds.forEach(eventId => {
            defaultAssignments[eventId] = { team: 'unassigned', role: 'member' };
        });
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
                                assignments: defaultAssignments
                            }, { merge: true });
                            playersAdded++;
                        }
                    }
                }
            }
        }
        if (playersAdded === 0) return alert('No valid players found.');
        try {
            await batch.commit();
            alert(`Successfully imported and processed ${playersAdded} players for all events!`);
            loadData();
        } catch (error) {
            console.error('FIREBASE IMPORT ERROR: ', error);
            alert('An error occurred during import. Check console.');
        }
    }

    // --- CSV Export Function ---
    async function exportRosterToCSV() {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return alert("No event selected.");
        console.log(`Exporting roster for event: ${activeEventId}`);
        try {
            const rosterSnapshot = await db.collection('roster').orderBy('name').get();
            if (rosterSnapshot.empty) return alert('Roster is empty.');
            const eventDoc = await db.collection('events').doc(activeEventId).get();
            const eventName = eventDoc.exists ? eventDoc.data().name : activeEventId;
            let csvContent = `Name,Availability,Team,Role (Event: ${eventName})\n`;
            const teamsSnapshot = await db.collection('teams').where('eventId', '==', activeEventId).get();
            const teamNameMap = new Map();
            teamsSnapshot.forEach(doc => {
                teamNameMap.set(doc.id, doc.data().name);
            });
            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                const assignment = player.assignments ? player.assignments[activeEventId] : null;
                const teamId = assignment ? assignment.team : 'unassigned';
                const role = assignment ? assignment.role : 'member';
                const teamName = teamNameMap.get(teamId) || teamId;
                csvContent += `"${player.name}","${player.availability}","${teamName}","${role}"\n`;
            });
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `${eventName}_roster.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) { console.error('FIREBASE EXPORT ERROR: ', error); }
    }
    
    // --- Event Selector Loader ---
    async function loadEventSelector() {
        try {
            const eventsSnapshot = await db.collection('events').get();
            if (eventsSnapshot.empty) {
                eventSelector.innerHTML = '<option value="">No events found</option>';
                return;
            }
            eventSelector.innerHTML = '';
            allEventIds = [];
            eventsSnapshot.forEach((doc, index) => {
                const event = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = event.name;
                eventSelector.appendChild(option);
                allEventIds.push(doc.id);
                if (index === 0) {
                    activeEventId = doc.id;
                    eventSelector.value = doc.id;
                }
            });
            console.log(`Found ${allEventIds.length} events. Defaulting to ${activeEventId}.`);
            loadData();
        } catch (error) {
            console.error("Error loading events: ", error);
            eventSelector.innerHTML = '<option value="">Error loading</option>';
        } finally {
            // NEW: This will always run, hiding the loading screen
            // and showing the main app content.
            loadingContainer.style.display = 'none';
            mainContent.style.display = 'flex';
        }
    }
    
    // --- Data Loading Function ---
    async function loadData() {
        if (!activeEventId) {
            console.log("loadData called, but no active event. Waiting for selector.");
            return;
        }
        console.log(`Loading data for event: ${activeEventId}`);
        sortableInstances.forEach(instance => instance.destroy());
        sortableInstances = [];
        mainRosterList.innerHTML = '<li>Loading...</li>';
        teamGrid.innerHTML = '';
        let assignedCount = 0;
        let totalCount = 0;
        try {
            const teamsSnapshot = await db.collection('teams').where('eventId', '==', activeEventId).get();
            const rosterSnapshot = await db.collection('roster').get();
            totalCount = rosterSnapshot.size;
            const playersByTeam = new Map();
            playersByTeam.set('unassigned', []);
            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                player.id = doc.id;
                const defaultAssignment = { team: 'unassigned', role: 'member' };
                const assignment = (player.assignments && player.assignments[activeEventId]) 
                                    ? player.assignments[activeEventId] 
                                    : defaultAssignment;
                const teamId = assignment.team || 'unassigned';
                player.role = assignment.role || 'member';
                if (!playersByTeam.has(teamId)) {
                    playersByTeam.set(teamId, []);
                }
                playersByTeam.get(teamId).push(player);
                if (teamId !== 'unassigned') {
                    assignedCount++;
                }
            });
            mainRosterList.innerHTML = '';
            playersByTeam.get('unassigned').sort(sortPlayers).forEach(player => {
                mainRosterList.appendChild(createPlayerLi(player));
            });
            teamsSnapshot.forEach(teamDoc => {
                const teamData = teamDoc.data();
                teamData.id = teamDoc.id;
                const teamPlayers = playersByTeam.get(teamData.id) || [];
                renderTeam(teamData, teamPlayers);
            });
            rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;
            console.log("Data loading and rendering complete.");
            initializeSortable();
        } catch (error) {
            console.error("Error loading all data: ", error);
            mainRosterList.innerHTML = '<li>Error loading roster. Check Rules.</li>';
        }
    }

    // --- createPlayerLi ---
    function createPlayerLi(player) {
        // (This function is unchanged from the last working version)
        const li = document.createElement('li');
        li.className = 'player-li';
        li.dataset.id = player.id;
        const icon = document.createElement('span');
        icon.className = 'player-icon';
        const role = player.role || 'member';
        if (role === 'group_leader') {
            li.classList.add('role-group_leader');
            icon.textContent = '👑';
        } else if (role === 'rally_leader') {
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

    // --- sortPlayers ---
    function sortPlayers(a, b) {
        // (This function is unchanged from the last working version)
        const roleOrder = { 'group_leader': 1, 'rally_leader': 2, 'member': 3 };
        const roleA = roleOrder[a.role || 'member'];
        const roleB = roleOrder[b.role || 'member'];
        if (roleA !== roleB) return roleA - roleB;
        return a.name.localeCompare(b.name);
    }

    // --- renderTeam ---
    function renderTeam(teamData, teamPlayers) {
        // (This function is unchanged from the last working version)
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
        teamPlayers.sort(sortPlayers).forEach(player => {
            playerList.appendChild(createPlayerLi(player));
        });
        teamContainer.appendChild(deleteBtn);
        teamContainer.appendChild(title);
        teamContainer.appendChild(description);
        teamContainer.appendChild(playerList);
        teamGrid.appendChild(teamContainer);
    }

    // --- updatePlayerRole ---
    function updatePlayerRole(playerId, newRole) {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return;
        console.log(`Setting player ${playerId} to role ${newRole} for event ${activeEventId}`);
        const updatePath = `assignments.${activeEventId}.role`;
        db.collection('roster').doc(playerId).update({
            [updatePath]: newRole
        })
        .then(() => {
            console.log("Role updated!");
            loadData();
        })
        .catch(error => {
            console.error("Error updating role: ", error);
            alert("Error updating role. Player might not be fully imported. Try re-importing your CSV.");
        });
    }
    
    // --- addNewTeam ---
    function addNewTeam() {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return;
        console.log(`Adding new team for event ${activeEventId}`);
        db.collection('teams').add({
            name: "New Team",
            description: "",
            eventId: activeEventId
        })
        .then(() => loadData())
        .catch(error => console.error("Error adding team: ", error));
    }
    
    // --- deleteTeam ---
    async function deleteTeam(teamId, teamName) {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return;
        if (!confirm(`Are you sure you want to delete "${teamName}"? This will only remove it from the ${activeEventId} event.`)) return;
        try {
            console.log(`Deleting team ${teamId}...`);
            const playersQuery = db.collection('roster').where(`assignments.${activeEventId}.team`, '==', teamId);
            const playersSnapshot = await playersQuery.get();
            const batch = db.batch();
            const updatePathTeam = `assignments.${activeEventId}.team`;
            const updatePathRole = `assignments.${activeEventId}.role`;
            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    [updatePathTeam]: 'unassigned',
                    [updatePathRole]: 'member'
                });
            });
            const teamRef = db.collection('teams').doc(teamId);
            batch.delete(teamRef);
            await batch.commit();
            loadData();
        } catch (error) { console.error("Error deleting team: ", error); }
    }
    
    // --- NEW: deletePlayer (Permanent) ---
    async function deletePlayer(playerId) {
        if (!playerId) return;

        // Find the player's name for the confirm dialog
        let playerName = `this player (ID: ${playerId})`;
        try {
            const playerDoc = await db.collection('roster').doc(playerId).get();
            if (playerDoc.exists) {
                playerName = playerDoc.data().name;
            }
        } catch (e) {
            console.warn("Couldn't fetch player name for confirm dialog.");
        }

        if (!confirm(`Are you sure you want to PERMANENTLY delete ${playerName}? This cannot be undone.`)) {
            return;
        }
        
        console.log(`Deleting player ${playerId}...`);
        try {
            await db.collection('roster').doc(playerId).delete();
            console.log("Player permanently deleted.");
            loadData(); // Reload the UI
        } catch (error) {
            console.error("Error deleting player: ", error);
            alert("An error occurred while trying to delete the player.");
        }
    }
    
    // --- updateTeamData ---
    function updateTeamData(teamId, dataToUpdate) {
        // (This function is unchanged from the last working version)
        db.collection('teams').doc(teamId).update(dataToUpdate)
            .then(() => console.log(`Team ${teamId} updated`))
            .catch(error => console.error("Error updating team: ", error));
    }

    // --- clearAllTeams ---
    async function clearAllTeams() {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return;
        if (!confirm(`Are you sure you want to clear all teams for ${activeEventId}? All players in this event will be moved to the roster and roles reset.`)) return;
        console.log(`Clearing all teams for ${activeEventId}...`);
        try {
            const playersQuery = db.collection('roster').where(`assignments.${activeEventId}.team`, '!=', 'unassigned');
            const playersSnapshot = await playersQuery.get();
            if (playersSnapshot.empty) {
                alert("All players are already unassigned for this event.");
                return;
            }
            const batch = db.batch();
            const updatePathTeam = `assignments.${activeEventId}.team`;
            const updatePathRole = `assignments.${activeEventId}.role`;
            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    [updatePathTeam]: 'unassigned',
                    [updatePathRole]: 'member'
                });
            });
            await batch.commit();
            console.log(`Moved ${playersSnapshot.size} players to unassigned for ${activeEventId}.`);
            loadData();
        } catch (error) { console.error("Error clearing teams: ", error); }
    }

    // --- initializeSortable ---
    function initializeSortable() {
        // (This function is unchanged from the last working version)
        if (!activeEventId) return;
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
                    console.log(`Moving player ${playerId} to team ${newTeam} for event ${activeEventId}`);
                    const updatePath = `assignments.${activeEventId}.team`;
                    db.collection('roster').doc(playerId).update({
                        [updatePath]: newTeam
                    })
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
    loadEventSelector();
});
