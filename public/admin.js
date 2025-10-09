
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, query, where, onSnapshot, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { firebaseConfig } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // 1. INITIALIZATION
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const functions = getFunctions(app, 'us-central1');

    // 2. FIREBASE CALLABLE FUNCTIONS
    const manageKycRequest = httpsCallable(functions, 'manageKycRequest');
    const processWithdrawal = httpsCallable(functions, 'processWithdrawal');
    const getAnnouncements = httpsCallable(functions, 'getAnnouncements');
    const addAnnouncement = httpsCallable(functions, 'addAnnouncement');
    const updateAnnouncement = httpsCallable(functions, 'updateAnnouncement');
    const deleteAnnouncement = httpsCallable(functions, 'deleteAnnouncement');
    const processAllWithdrawalsManager = httpsCallable(functions, 'processAllWithdrawalsManager');
    const addGraphDataPoint = httpsCallable(functions, 'addGraphDataPoint');
    const calculateRemainingSupply = httpsCallable(functions, 'calculateRemainingSupply');

    // 3. DOM ELEMENT CACHE
    const dom = {
        // Containers
        authContainer: document.getElementById('admin-auth-container'),
        appContainer: document.getElementById('admin-app-container'),
        
        // Auth
        loginButton: document.getElementById('admin-login-button'),
        logoutButton: document.getElementById('admin-logout-button'),
        emailInput: document.getElementById('admin-email-input'),
        passwordInput: document.getElementById('admin-password-input'),
        authError: document.getElementById('admin-auth-error'),
        adminEmailDisplay: document.getElementById('admin-email-display'),

        // Navigation
        navButtons: document.querySelectorAll('#main-nav .nav-button'),
        contentSections: document.querySelectorAll('.content-wrapper .admin-section'),

        // KYC
        kycTable: document.getElementById('kyc-requests-table'),
        kycTableBody: document.getElementById('kyc-requests-table-body'),
        noKycRequestsMessage: document.getElementById('no-kyc-requests-message'),

        // Withdrawals
        withdrawalTable: document.getElementById('withdrawal-requests-table'),
        withdrawalTableBody: document.getElementById('withdrawal-requests-table-body'),
        noWithdrawalRequestsMessage: document.getElementById('no-withdrawal-requests-message'),
        exportWithdrawalsCsvButton: document.getElementById('export-withdrawals-csv-admin'),
        approveAllWithdrawalsButton: document.getElementById('approve-all-withdrawals-btn'),
        
        // Announcements
        announcementsTable: document.getElementById('announcements-table'),
        announcementTableBody: document.getElementById('announcements-table-body'),
        announcementForm: document.getElementById('announcement-form-container'),
        announcementTitle: document.getElementById('announcement-title'),
        announcementContent: document.getElementById('announcement-content'),
        announcementSubmitBtn: document.getElementById('announcement-submit-btn'),
        noAnnouncementsMessage: document.getElementById('no-announcements-message'),

        // Graph Data
        graphDataForm: document.getElementById('graph-data-form-container'),
        graphDateInput: document.getElementById('graph-date-input'),
        graphPhxInput: document.getElementById('graph-phx-input'),
        graphDataSubmitBtn: document.getElementById('graph-data-submit-btn'),
        graphDataMessage: document.getElementById('graph-data-message'),
        calculateSupplyBtn: document.getElementById('calculate-supply-btn'),
        supplyResultsContainer: document.getElementById('supply-results-container'),
        totalCirculatingSupply: document.getElementById('total-circulating-supply'),
        remainingSupply: document.getElementById('remaining-supply'),

    };

    // 4. STATE
    let kycUnsubscribe = null;
    let withdrawalUnsubscribe = null;
    let currentEditAnnouncementId = null;

    // 5. NAVIGATION LOGIC
    function showSection(sectionIdToShow) {
        dom.contentSections.forEach(section => {
            section.classList.add('hidden');
        });
        const sectionToShow = document.getElementById(sectionIdToShow);
        if (sectionToShow) {
            sectionToShow.classList.remove('hidden');
        }
        dom.navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.section === sectionIdToShow);
        });
    }

    dom.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Reset graph section UI when navigating away
            if (button.dataset.section !== 'graph-data-section') {
                dom.supplyResultsContainer.classList.add('hidden');
                dom.calculateSupplyBtn.textContent = 'Calculate Now';
            }
            showSection(button.dataset.section);
        });
    });

    // 6. AUTHENTICATION
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const idTokenResult = await user.getIdTokenResult();
            if (idTokenResult.claims.admin) {
                dom.authContainer.classList.add('hidden');
                dom.appContainer.style.display = 'block';
                dom.adminEmailDisplay.textContent = user.email;
                
                attachRealtimeListeners();
                fetchAndRenderAnnouncements();
                
                showSection('kyc-requests-section'); // Default section on login
            } else {
                dom.appContainer.style.display = 'none';
                dom.authContainer.classList.remove('hidden');
                dom.authError.textContent = 'You do not have permission to access this page.';
            }
        } else {
            dom.appContainer.style.display = 'none';
            dom.authContainer.classList.remove('hidden');
            dom.authError.textContent = '';
            dom.emailInput.value = '';
            dom.passwordInput.value = '';
            
            if (kycUnsubscribe) kycUnsubscribe();
            if (withdrawalUnsubscribe) withdrawalUnsubscribe();
        }
    });
    
    dom.loginButton.addEventListener('click', async () => {
        try {
            await signInWithEmailAndPassword(auth, dom.emailInput.value, dom.passwordInput.value);
        } catch (error) {
            dom.authError.textContent = 'Login failed. Please check your credentials.';
            console.error('Login error:', error);
        }
    });

    dom.logoutButton.addEventListener('click', () => signOut(auth));

    // 7. DATA FETCHING & RENDERING
    function attachRealtimeListeners() {
        if (kycUnsubscribe) kycUnsubscribe();
        const kycQuery = query(collection(db, 'users'), where("kycStatus", "==", "pending"));
        kycUnsubscribe = onSnapshot(kycQuery, snapshot => renderKycTable(snapshot.docs), console.error);

        if (withdrawalUnsubscribe) withdrawalUnsubscribe();
        const wQuery = query(collection(db, 'withdrawals'), where("status", "==", "pending"), orderBy("requestedAt", "desc"));
        withdrawalUnsubscribe = onSnapshot(wQuery, snapshot => renderWithdrawalTable(snapshot.docs), 
            (error) => {
                console.error("Error fetching withdrawals:", error);
                dom.withdrawalTable.classList.add('hidden');
                dom.noWithdrawalRequestsMessage.classList.remove('hidden');
                dom.noWithdrawalRequestsMessage.textContent = 'Failed to load withdrawal requests. A database index might be required. Please check the console for more details.';
            }
        );
    }

    function renderKycTable(docs) {
        const hasRequests = docs.length > 0;
        dom.noKycRequestsMessage.classList.toggle('hidden', hasRequests);
        dom.kycTable.classList.toggle('hidden', !hasRequests);

        dom.kycTableBody.innerHTML = '';
        if (!hasRequests) return;

        docs.forEach(doc => {
            const user = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${user.email || 'N/A'}</td>
                <td>${user.kycWalletAddress || 'N/A'}</td>
                <td>${doc.id}</td>
                <td class="actions">
                    <button class="approve-btn" data-uid="${doc.id}">Approve</button>
                    <button class="reject-btn" data-uid="${doc.id}">Reject</button>
                </td>
            `;
            dom.kycTableBody.appendChild(tr);
        });
    }

    function renderWithdrawalTable(docs) {
        const hasRequests = docs.length > 0;
        dom.noWithdrawalRequestsMessage.classList.toggle('hidden', hasRequests);
        dom.withdrawalTable.classList.toggle('hidden', !hasRequests);

        dom.exportWithdrawalsCsvButton.disabled = !hasRequests;
        dom.approveAllWithdrawalsButton.disabled = !hasRequests;

        dom.withdrawalTableBody.innerHTML = '';
        if (!hasRequests) return;

        docs.forEach(doc => {
            const req = doc.data();
            const tr = document.createElement('tr');
            tr.dataset.id = doc.id; 
            tr.innerHTML = `
                <td>${req.email || 'N/A'}</td>
                <td>${req.destinationAddress}</td>
                <td class="amount">${req.finalAmount.toFixed(4)} PHX</td>
                <td>${req.requestedAt.toDate().toLocaleString()}</td>
                <td class="actions">
                     <button class="approve-btn" data-id="${doc.id}">Approve</button>
                     <button class="reject-btn" data-id="${doc.id}">Reject</button>
                </td>
            `;
            dom.withdrawalTableBody.appendChild(tr);
        });
    }

    async function fetchAndRenderAnnouncements() {
        try {
            const result = await getAnnouncements();
            const announcements = result.data;
            const hasAnnouncements = announcements.length > 0;

            dom.noAnnouncementsMessage.classList.toggle('hidden', hasAnnouncements);
            dom.announcementsTable.classList.toggle('hidden', !hasAnnouncements);
            
            dom.announcementTableBody.innerHTML = '';
            if (!hasAnnouncements) return;
            
            announcements.forEach(ann => {
                const tr = document.createElement('tr');
                tr.dataset.id = ann.id;
                tr.dataset.title = ann.title;
                tr.dataset.content = ann.content;
                tr.innerHTML = `
                    <td>${ann.title}</td>
                    <td>${ann.content}</td>
                    <td class="actions">
                        <button class="edit-btn">Edit</button>
                        <button class="delete-btn">Delete</button>
                    </td>
                `;
                dom.announcementTableBody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error fetching announcements:", error);
            dom.noAnnouncementsMessage.classList.remove('hidden');
            dom.announcementsTable.classList.add('hidden');
            dom.noAnnouncementsMessage.textContent = 'Error loading announcements.';
        }
    }
    
    // 8. ACTION HANDLERS

    // KYC Actions
    dom.kycTableBody.addEventListener('click', async e => {
        if (!e.target.matches('.approve-btn, .reject-btn')) return;
        const btn = e.target;
        const action = btn.classList.contains('approve-btn') ? 'approve' : 'reject';
        const targetUid = btn.dataset.uid;
        btn.disabled = true;
        try {
            await manageKycRequest({ targetUid, action });
        } catch (error) {
            alert(`Error: ${error.message}`);
            btn.disabled = false;
        }
    });

    // Withdrawal Actions
    dom.withdrawalTableBody.addEventListener('click', async e => {
        if (!e.target.matches('.approve-btn, .reject-btn')) return;
        const btn = e.target;
        const action = btn.classList.contains('approve-btn') ? 'approve' : 'reject';
        const withdrawalId = btn.dataset.id;
        btn.disabled = true;
        try {
            await processWithdrawal({ withdrawalId, action, transactionHash: null });
        } catch (error) {
            alert(`Error: ${error.message}`);
            btn.disabled = false;
        }
    });

    // Approve All Withdrawals
    dom.approveAllWithdrawalsButton.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to queue ALL pending withdrawals for processing?')) {
            return;
        }

        const btn = dom.approveAllWithdrawalsButton;
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Queueing...';

        try {
            const result = await processAllWithdrawalsManager();
            alert(result.data.message || 'Successfully queued withdrawals for processing.');
        } catch (error) {
            console.error('Error queueing withdrawals:', error);
            alert(`Error: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Export to CSV
    dom.exportWithdrawalsCsvButton.addEventListener('click', async () => {
        const btn = dom.exportWithdrawalsCsvButton;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Generating...';

        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Authentication expired. Please reload.");

            const idToken = await user.getIdToken();
            const functionUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/exportPendingWithdrawalsCSV`;

            const response = await fetch(functionUrl, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Failed to download CSV.');
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition');
            let filename = 'pending-withdrawals.csv';
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) { 
                  filename = matches[1].replace(/['"]/g, '');
                }
            }

            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error('Error exporting CSV:', error);
            alert(`Failed to export CSV: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });

    // Announcement Actions
    dom.announcementForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = dom.announcementTitle.value.trim();
        const content = dom.announcementContent.value.trim();
        if (!title || !content) return alert('Title and content are required.');

        dom.announcementSubmitBtn.disabled = true;
        
        try {
            if (currentEditAnnouncementId) {
                await updateAnnouncement({ id: currentEditAnnouncementId, title, content });
            } else {
                await addAnnouncement({ title, content });
            }
            resetAnnouncementForm();
            await fetchAndRenderAnnouncements();
        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            dom.announcementSubmitBtn.disabled = false;
        }
    });

    dom.announcementTableBody.addEventListener('click', async (e) => {
        const btn = e.target;
        const tr = btn.closest('tr');
        if (!tr) return;
        const id = tr.dataset.id;

        if (btn.classList.contains('edit-btn')) {
            dom.announcementTitle.value = tr.dataset.title;
            dom.announcementContent.value = tr.dataset.content;
            dom.announcementSubmitBtn.textContent = 'Update Announcement';
            currentEditAnnouncementId = id;
            dom.announcementTitle.focus();
        } else if (btn.classList.contains('delete-btn')) {
            if (!confirm('Are you sure you want to delete this announcement?')) return;
            btn.disabled = true;
            try {
                await deleteAnnouncement({ id });
                await fetchAndRenderAnnouncements();
                 if (currentEditAnnouncementId === id) {
                    resetAnnouncementForm();
                }
            } catch (error) {
                alert(`Error: ${error.message}`);
                btn.disabled = false;
            }
        }
    });
    
    function resetAnnouncementForm() {
        currentEditAnnouncementId = null;
        dom.announcementForm.reset();
        dom.announcementSubmitBtn.textContent = 'Add Announcement';
    }

    // Graph Data & Supply Calculation Actions
    dom.calculateSupplyBtn.addEventListener('click', async () => {
        const btn = dom.calculateSupplyBtn;
        btn.disabled = true;
        btn.textContent = 'Calculating...';
        dom.supplyResultsContainer.classList.remove('hidden');
        dom.totalCirculatingSupply.textContent = '...';
        dom.remainingSupply.textContent = '...';

        try {
            const result = await calculateRemainingSupply();
            
            const { totalWithdrawable, remainingSupply } = result.data;
            
            dom.totalCirculatingSupply.textContent = `${totalWithdrawable.toLocaleString()} PHX`;
            dom.remainingSupply.textContent = `${remainingSupply.toLocaleString()} PHX`;
        } catch (error) {

            console.error("Error calculating supply:", error);
            dom.totalCirculatingSupply.textContent = 'Error';
            dom.remainingSupply.textContent = 'Error';
            alert(`Error: ${error.message}`);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Recalculate';
        }
    });

    dom.graphDataForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const date = dom.graphDateInput.value;
        const phxValue = parseFloat(dom.graphPhxInput.value);

        if (!date || isNaN(phxValue) || phxValue < 0) {
            dom.graphDataMessage.textContent = 'Please enter a valid date and a non-negative PHX value.';
            dom.graphDataMessage.className = 'message error';
            return;
        }

        dom.graphDataSubmitBtn.disabled = true;
        dom.graphDataMessage.textContent = 'Saving...';
        dom.graphDataMessage.className = 'message info';

        try {
            const result = await addGraphDataPoint({ date, phxValue });
            dom.graphDataMessage.textContent = result.data.message || 'Successfully saved data point!';
            dom.graphDataMessage.className = 'message success';
            dom.graphDataForm.reset();
        } catch (error) {
            console.error('Error adding graph data:', error);
            dom.graphDataMessage.textContent = `Error: ${error.message}`;
            dom.graphDataMessage.className = 'message error';
        } finally {
            dom.graphDataSubmitBtn.disabled = false;
            setTimeout(() => {
                dom.graphDataMessage.textContent = '';
                dom.graphDataMessage.className = 'message';
            }, 5000);
        }
    });
});
