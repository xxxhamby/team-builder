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

// The MOST important variable: tracks the currently selected event
let activeEventId = null;
// NEW: A list of all available event IDs for the import function
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

    // UPDATED: Event selector listener now re-loads all data
    eventSelector.addEventListener('change', () => {
        activeEventId = eventSelector.value;
        console.log(`Active event changed to: ${activeEventId}`);
        loadData(); // Load the data for the newly selected event
    });

    // --- Context Menu Listeners (Unchanged) ---
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

    // --- NEW: CSV Parsing Function (The "Big Rewrite" version) ---
    async function parseAndUpload(csvData) {
        const rows = csvData.split('\n').map(row => row.trim());
        if (rows.length < 2) return alert('CSV file is empty.');
        
        const headerRow = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const playerIndex = headerRow.indexOf('Player');
        if (playerIndex === -1) return alert('Error: "Player" column not found.');
        
        // This is a complex operation. We'll show a "loading" alert.
        alert('Importing players... This may take a moment as we set up all event presets.');
        console.log(`Importing... will create default assignments for ${allEventIds.length} events.`);

        const batch = db.batch();
        let playersAdded = 0;

        // Create a default assignment map that every new player will get
        const defaultAssignments = {};
        allEventIds.forEach(eventId => {
            defaultAssignments[eventId] = { team: 'unassigned', role: 'member' };
        });

        // Loop through all data rows (skipping header)
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

                            // Set player data. We use { merge: true }
                            // This adds the 'name' and 'availability' fields
                            // AND merges the 'defaultAssignments' with any
                            // 'assignments' map that might already exist.
                            batch.set(playerRef, {
                                name: cleanedName,
                                availability: 'Unknown',
                                assignments: defaultAssignments
                            }, { merge: true }); // Merge is critical
                            
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
            loadData(); // Reload the UI
        } catch (error) {
            console.error('FIREBASE IMPORT ERROR: ', error);
            alert('An error occurred during import. Check console.');
        }
    }

    // --- NEW: CSV Export Function (Event-Aware) ---
    async function exportRosterToCSV() {
        if (!activeEventId) return alert("No event selected.");
        
        console.log(`Exporting roster for event: ${activeEventId}`);
        try {
            const rosterSnapshot = await db.collection('roster').orderBy('name').get();
            if (rosterSnapshot.empty) return alert('Roster is empty.');
            
            // Get the name of the current event
            const eventDoc = await db.collection('events').doc(activeEventId).get();
            const eventName = eventDoc.exists ? eventDoc.data().name : activeEventId;
            
            let csvContent = `Name,Availability,Team,Role (Event: ${eventName})\n`;
            
            // We need to fetch all teams for *this event* to match IDs to names
            const teamsSnapshot = await db.collection('teams').where('eventId', '==', activeEventId).get();
            const teamNameMap = new Map();
            teamsSnapshot.forEach(doc => {
                teamNameMap.set(doc.id, doc.data().name);
            });

            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                
                // Get the assignment for the *active event*
                const assignment = player.assignments ? player.assignments[activeEventId] : null;
                
                const teamId = assignment ? assignment.team : 'unassigned';
                const role = assignment ? assignment.role : 'member';
                
                const teamName = teamNameMap.get(teamId) || teamId; // Use name if we have it
                
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
    
    // --- NEW: Event Selector Loader ---
    async function loadEventSelector() {
        try {
            const eventsSnapshot = await db.collection('events').get();
            if (eventsSnapshot.empty) {
                eventSelector.innerHTML = '<option value="">No events found</option>';
                return;
            }
            
            eventSelector.innerHTML = '';
            allEventIds = []; // Clear the global list
            
            eventsSnapshot.forEach((doc, index) => {
                const event = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = event.name;
                eventSelector.appendChild(option);
                
                allEventIds.push(doc.id); // Add to our global list
                
                if (index === 0) {
                    activeEventId = doc.id;
                    eventSelector.value = doc.id;
                }
            });
            
            console.log(`Found ${allEventIds.length} events. Defaulting to ${activeEventId}.`);
            // Now that we have an active event, load the main data
            loadData();

        } catch (error) {
            console.error("Error loading events: ", error);
            eventSelector.innerHTML = '<option value="">Error loading</option>';
        }
    }
    
    // --- NEW: Data Loading Function (The "Big Rewrite" version) ---
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
            // 1. Load all teams for THIS EVENT
            const teamsSnapshot = await db.collection('teams').where('eventId', '==', activeEventId).get();
            
            // 2. Load all players
            const rosterSnapshot = await db.collection('roster').get();
            
            totalCount = rosterSnapshot.size;
            
            // 3. Map players to their *current event* assignment
            const playersByTeam = new Map();
            playersByTeam.set('unassigned', []);
            
            rosterSnapshot.forEach(doc => {
                const player = doc.data();
                player.id = doc.id;
                
                // Get the assignment for the *active event*
                // Fallback to default if 'assignments' map or eventId doesn't exist
                const defaultAssignment = { team: 'unassigned', role: 'member' };
                const assignment = (player.assignments && player.assignments[activeEventId]) 
                                    ? player.assignments[activeEventId] 
                                    : defaultAssignment;
                
                const teamId = assignment.team || 'unassigned';
                player.role = assignment.role || 'member'; // Set role for sorting
                
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
            playersByTeam.get('unassigned').sort(sortPlayers).forEach(player => {
                mainRosterList.appendChild(createPlayerLi(player));
            });

            // 5. Render all teams for this event
            teamsSnapshot.forEach(teamDoc => {
                const teamData = teamDoc.data();
                teamData.id = teamDoc.id;
                const teamPlayers = playersByTeam.get(teamData.id) || [];
                renderTeam(teamData, teamPlayers);
            });

            // 6. Update heading
            rosterHeading.textContent = `My Roster (${assignedCount} / ${totalCount})`;
            console.log("Data loading and rendering complete.");
            
            // 7. Re-initialize drag-and-drop
            initializeSortable();

        } catch (error) {
            console.error("Error loading all data: ", error);
            mainRosterList.innerHTML = '<li>Error loading roster. Check Rules.</li>';
        }
    }

    // --- createPlayerLi (Unchanged from last version) ---
    function createPlayerLi(player) {
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

    // --- sortPlayers (Unchanged from last version) ---
    function sortPlayers(a, b) {
        const roleOrder = { 'group_leader': 1, 'rally_leader': 2, 'member': 3 };
        const roleA = roleOrder[a.role || 'member'];
        const roleB = roleOrder[b.role || 'member'];
        if (roleA !== roleB) return roleA - roleB;
        return a.name.localeCompare(b.name);
    }

    // --- renderTeam (Unchanged from last version) ---
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
        teamPlayers.sort(sortPlayers).forEach(player => {
            playerList.appendChild(createPlayerLi(player));
        });
        teamContainer.appendChild(deleteBtn);
        teamContainer.appendChild(title);
        teamContainer.appendChild(description);
        teamContainer.appendChild(playerList);
        teamGrid.appendChild(teamContainer);
    }

    // --- NEW: updatePlayerRole (Event-Aware) ---
    function updatePlayerRole(playerId, newRole) {
        if (!activeEventId) return;
        console.log(`Setting player ${playerId} to role ${newRole} for event ${activeEventId}`);
        
        // Use dot notation to update a field inside a map
        const updatePath = `assignments.${activeEventId}.role`;
        
        db.collection('roster').doc(playerId).update({
            [updatePath]: newRole
        })
        .then(() => {
            console.log("Role updated!");
            loadData(); // Reload to show the change
        })
        .catch(error => {
            console.error("Error updating role: ", error);
            alert("Error updating role. Player might not be fully imported. Try re-importing your CSV.");
        });
    }
    
    // --- NEW: addNewTeam (Event-Aware) ---
    function addNewTeam() {
        if (!activeEventId) return;
        console.log(`Adding new team for event ${activeEventId}`);
        db.collection('teams').add({
            name: "New Team",
            description: "",
            eventId: activeEventId // Link team to the current event
        })
        .then(() => loadData())
        .catch(error => console.error("Error adding team: ", error));
    }
    
    // --- NEW: deleteTeam (Event-Aware) ---
    async function deleteTeam(teamId, teamName) {
        if (!activeEventId) return;
        if (!confirm(`Are you sure you want to delete "${teamName}"? This will only remove it from the ${activeEventId} event.`)) return;
        
        try {
            console.log(`Deleting team ${teamId}...`);
            // 1. Find all players assigned to this team *for this event*
            const playersQuery = db.collection('roster').where(`assignments.${activeEventId}.team`, '==', teamId);
            const playersSnapshot = await playersQuery.get();
            
            const batch = db.batch();
            
            // 2. Set those players to unassigned *for this event*
            const updatePathTeam = `assignments.${activeEventId}.team`;
            const updatePathRole = `assignments.${activeEventId}.role`;
            playersSnapshot.forEach(doc => {
                batch.update(doc.ref, {
                    [updatePathTeam]: 'unassigned',
                    [updatePathRole]: 'member'
                });
            });
            
            // 3. Delete the team document
            const teamRef = db.collection('teams').doc(teamId);
            batch.delete(teamRef);
            
            await batch.commit();
            loadData();
        } catch (error) { console.error("Error deleting team: ", error); }
    }
    
    // --- updateTeamData (Unchanged) ---
    function updateTeamData(teamId, dataToUpdate) {
        db.collection('teams').doc(teamId).update(dataToUpdate)
            .then(() => console.log(`Team ${teamId} updated`))
            .catch(error => console.error("Error updating team: ", error));
    }

    // --- NEW: clearAllTeams (Event-Aware) ---
    async function clearAllTeams() {
        if (!activeEventId) return;
        if (!confirm(`Are you sure you want to clear all teams for ${activeEventId}? All players in this event will be moved to the roster and roles reset.`)) return;
        
        console.log(`Clearing all teams for ${activeEventId}...`);
        try {
            // 1. Find all players assigned to a team *for this event*
            const playersQuery = db.collection('roster').where(`assignments.${activeEventId}.team`, '!=', 'unassigned');
            const playersSnapshot = await playersQuery.get();
            
            if (playersSnapshot.empty) {
                alert("All players are already unassigned for this event.");
                return;
            }
            
            const batch = db.batch();
            const updatePathTeam = `assignments.${activeEventId}.team`;
            const updatePathRole = `assignments.${activeEventId}.role`;

            // 2. Set them to unassigned *for this event*
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

    // --- NEW: initializeSortable (Event-Aware) ---
    function initializeSortable() {
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
                    
                    // Use dot notation to update the team field for the *active event*
                    const updatePath = `assignments.${activeEventId}.team`;
                    db.collection('roster').doc(playerId).update({
                        [updatePath]: newTeam
                    })
                    .then(() => {
                        console.log("Player team updated successfully.");
                        loadData(); // Full reload to update sorting and counts
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
