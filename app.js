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

// NEW: Global variable to track the active event
let activeEventId = null; 

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
    
    // NEW: Get event selector
    const eventSelector = document.getElementById('event-selector');

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

    // NEW: Event selector listener
    eventSelector.addEventListener('change', () => {
        activeEventId = eventSelector.value;
        console.log(`Active event changed to: ${activeEventId}`);
        // We will make loadData() work in the next step
        // For now, it will just select the event
        alert(`Event changed to: ${activeEventId}. We will enable loading this data in our next step!`);
        // loadData(); // This will be enabled in our next step
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

    // --- CSV Parsing Function ---
    // NOTE: This will be heavily modified in our next step.
    // For now, it still adds to the *old* structure.
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
                            // THIS WILL BE REPLACED
                            batch.set(playerRef, {
                                name: cleanedName,
                                availability: 'Unknown',
                                // We are setting the *old* fields for now
                                team: 'unassigned', 
                                role: 'member'
                                // In our next step, we will add the 'assignments' map
                            }, { merge: true }); // Merge to avoid deleting 'assignments'
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
    // This function will also be updated next.
    async function exportRosterToCSV() {
        alert("This function will be updated to export for the *current event* in our next step!");
    }
    
    // --- Data Loading ---
    
    // NEW: Function to load the event list into the dropdown
    async function loadEventSelector() {
        try {
            const eventsSnapshot = await db.collection('events').get();
            if (eventsSnapshot.empty) {
                eventSelector.innerHTML = '<option value="">No events found</option>';
                return;
            }
            
            eventSelector.innerHTML = ''; // Clear "Loading..."
            
            eventsSnapshot.forEach((doc, index) => {
                const event = doc.data();
                const option = document.createElement('option');
                option.value = doc.id; // e.g., "castle_battle"
                option.textContent = event.name; // e.g., "Castle Battle"
                eventSelector.appendChild(option);
                
                // Set the first event as the active one
                if (index === 0) {
                    activeEventId = doc.id;
                    eventSelector.value = doc.id;
                }
            });
            
            // Now that we have an active event, load the main data
            // We will build this new loadData() next
            loadData();

        } catch (error) {
            console.error("Error loading events: ", error);
            eventSelector.innerHTML = '<option value="">Error loading</option>';
        }
    }
    
    // This is our OLD function. It will be replaced.
    async function loadData() {
        console.log(`Loading data for event: ${activeEventId}... (This part will be built next)`);
        
        // This is a placeholder to show the old data for now
        // This will all be rewritten
        console.log("Loading placeholder data...");
        sortableInstances.forEach(instance => instance.destroy());
        sortableInstances = [];
        mainRosterList.innerHTML = '<li>Loading...</li>';
        teamGrid.innerHTML = '';
        
        // For now, just show a message.
        mainRosterList.innerHTML = '<li>This app is being upgraded.</li>';
        teamGrid.innerHTML = '<p style="color: #aaa; text-align: center;">Please wait for the next step to load event data.</p>';
        rosterHeading.textContent = `My Roster (0 / 0)`;
        
        // --- THIS IS A PREVIEW of the old functions ---
        // We are keeping them here, but they won't run until we
        // call loadData() properly in the next step.
    }

    // --- OLD Functions (To be updated) ---

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

    function sortPlayers(a, b) {
        const roleOrder = { 'group_leader': 1, 'rally_leader': 2, 'member': 3 };
        const roleA = roleOrder[a.role || 'member'];
        const roleB = roleOrder[b.role || 'member'];
        if (roleA !== roleB) return roleA - roleB;
        return a.name.localeCompare(b.name);
    }

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

    function updatePlayerRole(playerId, newRole) {
        console.log(`Setting player ${playerId} to role ${newRole} for event ${activeEventId}`);
        alert(`This function will be updated in the next step to save to the correct event preset!`);
    }
    
    function addNewTeam() {
        console.log(`Adding new team for event ${activeEventId}`);
        alert(`This function will be updated in the next step to save to the correct event preset!`);
    }
    
    async function deleteTeam(teamId, teamName) {
        alert(`This function will be updated in the next step!`);
    }
    
    function updateTeamData(teamId, dataToUpdate) {
        alert(`This function will be updated in the next step!`);
    }

    async function clearAllTeams() {
        alert(`This function will be updated in the next step to clear the current event!`);
    }

    function initializeSortable() {
        console.log("Sortable will be re-initialized in the next step.");
    }

    // --- Initial Page Load ---
    // This is now the *only* function called on page load.
    // It will load the events, set the first one, then call loadData().
    loadEventSelector();
});
