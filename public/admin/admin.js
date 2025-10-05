import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, getDocs, doc, getDoc, query, orderBy, limit, startAfter, collectionGroup, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from '../firebase-config.js';

document.addEventListener('DOMContentLoaded', function () {
    const app = initializeApp(firebaseConfig, "adminApp");
    const db = getFirestore(app);
    const functions = getFunctions(app, 'us-central1');

    const tabButtons = document.querySelectorAll('.tab-button');
    const contentSections = document.querySelectorAll('.content-section');
    const loadingOverlay = document.getElementById('loading-overlay');

    const showLoading = () => loadingOverlay.classList.remove('hidden');
    const hideLoading = () => loadingOverlay.classList.add('hidden');

    // Default tab
    showTab('dashboard-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetContentId = button.dataset.target;
            showTab(targetContentId);
        });
    });

    function showTab(contentId) {
        contentSections.forEach(section => {
            section.classList.toggle('hidden', section.id !== contentId);
        });
        tabButtons.forEach(button => {
            button.classList.toggle('active', button.dataset.target === contentId);
        });
        // Load content for the active tab
        loadContentForTab(contentId);
    }

    async function loadContentForTab(contentId) {
        switch (contentId) {
            case 'dashboard-content':
                await loadDashboard();
                break;
            case 'announcements-content':
                await loadAnnouncements();
                break;
            case 'users-content':
                await loadUsers();
                break;
            case 'kyc-requests-content':
                await loadKycRequests();
                break;
            case 'withdrawals-content':
                await loadWithdrawals();
                break;
            case 'graph-data-content':
                await loadGraphData();
                break;
        }
    }

    // Dashboard
    async function loadDashboard() {
        // ...
    }

    // Announcements
    const addAnnouncementForm = document.getElementById('add-announcement-form');
    const announcementsList = document.getElementById('announcements-list');
    const addAnnouncement = httpsCallable(functions, 'addAnnouncement');
    const getAnnouncements = httpsCallable(functions, 'getAnnouncements');

    async function loadAnnouncements() {
        showLoading();
        try {
            const result = await getAnnouncements();
            const announcements = result.data;
            announcementsList.innerHTML = ''; // Clear existing list
            announcements.forEach(ann => {
                const li = document.createElement('li');
                li.textContent = `[${new Date(ann.date).toLocaleString()}] ${ann.message}`;
                announcementsList.appendChild(li);
            });
        } catch (error) {
            console.error("Error loading announcements:", error);
            alert("Could not load announcements.");
        } finally {
            hideLoading();
        }
    }

    addAnnouncementForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = document.getElementById('announcement-message').value;
        if (!message) return;

        showLoading();
        try {
            await addAnnouncement({ message });
            addAnnouncementForm.reset();
            await loadAnnouncements(); // Refresh the list
            alert('Announcement added successfully!');
        } catch (error) {
            console.error("Error adding announcement:", error);
            alert(`Error: ${error.message}`);
        } finally {
            hideLoading();
        }
    });
    
    // Graph Data
    const republishGraphButton = document.getElementById('republish-graph-button');
    const republishStatusMessage = document.getElementById('republish-status-message');
    const republishGraph = httpsCallable(functions, 'republishGraph');

    async function loadGraphData() {
        republishStatusMessage.textContent = '';
        // You can add logic here to display current graph data if needed
    }

    republishGraphButton.addEventListener('click', async () => {
        if (!confirm("Are you sure you want to republish the graph data? This will overwrite the existing graph-data.json file.")) {
            return;
        }

        showLoading();
        republishStatusMessage.textContent = "Republishing in progress...";
        republishStatusMessage.style.color = "#ffa500";

        try {
            const result = await republishGraph();
            republishStatusMessage.textContent = result.data.message || "Graph republished successfully!";
            republishStatusMessage.style.color = "#4caf50";
            alert('Graph data republished successfully!');
        } catch (error) {
            console.error("Error republishing graph:", error);
            republishStatusMessage.textContent = `Error: ${error.message}`;
            republishStatusMessage.style.color = "#f44336";
            alert(`Failed to republish graph data: ${error.message}`);
        } finally {
            hideLoading();
        }
    });
});
