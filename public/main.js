
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, onSnapshot, updateDoc, collection, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { firebaseConfig } from './firebase-config.js';



document.addEventListener('DOMContentLoaded', () => {

    const splashScreen = document.getElementById('splash-screen');
    const isNative = window.Capacitor?.isNativePlatform() ?? false;

    // --- Splash Screen Logic ---
    setTimeout(() => {
        splashScreen.classList.add('fade-out');
        splashScreen.addEventListener('transitionend', () => {
            splashScreen.classList.add('hidden');
        });
    }, 2000); // 2-second delay

    try {
        let AdMob;
let rewardAdId;

if (isNative) {
    AdMob = Capacitor.Plugins.AdMob;
    rewardAdId = 'ca-app-pub-3940256099942544/5224354917';
}

        // ---- Main Ad Preparation Function (Updated) ----
        async function prepareRewardAd() {
            if (!isNative || isAdPreparing) return;
            console.log('Preparing a new reward ad...');
            isAdPreparing = true;
            try {
                // The new API uses 'loadRewarded'.
                await AdMob.loadRewarded({ adId: rewardAdId });
            } catch (error) {
                console.error('Error loading reward ad:', error);
                isAdPreparing = false; // Reset status on error
                // Retry loading after a delay if it fails
                setTimeout(prepareRewardAd, 15000);
            }
        }

                // --- AdMob Setup & Handlers (Updated for New API) ---
                async function initializeAdMob() {
                    if (!isNative || window.adMobInitialized) return;
                    window.adMobInitialized = true;
        
                    try {
                        await AdMob.initialize({
                            requestTrackingAuthorization: false,
                            initializeForTesting: true,
                        });
                        console.log("AdMob Initialized");
        
                        // --- Ad Event Listeners (New Version) ---
        
                        // Event: Ad has loaded successfully
                        AdMob.addListener('rewardedVideoLoaded', () => {
                            console.log('Reward ad is loaded and ready.');
                            isRewardAdReady = true;
                            isAdPreparing = false;
                        });
        
                        // Event: Ad failed to load
                        AdMob.addListener('rewardedVideoFailedToLoad', (error) => {
                            console.error('Reward ad failed to load:', error);
                            isRewardAdReady = false;
                            isAdPreparing = false;
                            // Automatically try to load a new ad after 15 seconds
                            setTimeout(prepareRewardAd, 15000);
                        });
        
                        // Event: User earned the reward
                        AdMob.addListener('rewardedVideoRewarded', async () => {
                            console.log('User earned the reward. Calling minePhx function...');
                            try {
                                const minePhx = httpsCallable(functions, 'minePhx');
                                await minePhx();
                                console.log('minePhx function call successful.');
                            } catch (err) {
                                alert(`Mining Error after ad: ${err.message}`);
                            }
                        });
        
                        // Event: User closed the ad
                        AdMob.addListener('rewardedVideoDismissed', () => {
                            console.log('Reward ad dismissed. Preparing the next ad.');
                            isRewardAdReady = false;
                            // Immediately start loading the next ad
                            prepareRewardAd();
                        });
        
                        // Prepare the very first ad when the app starts
                        prepareRewardAd();
        
                    } catch (error) {
                        console.error("Critical Error initializing AdMob:", error);
                    }
                }        


        // --- Initialize Firebase and Services ---
        const firebaseApp = initializeApp(firebaseConfig);
        window.firebaseApp = firebaseApp; // Allow console access
        const auth = getAuth(firebaseApp);
        const db = getFirestore(firebaseApp);
        const functions = getFunctions(firebaseApp, 'us-central1');
        const storage = getStorage(firebaseApp);

        // --- Constants ---
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        const MIN_WITHDRAWAL_SESSIONS = 170;
        const MIN_WITHDRAWAL_AMOUNT = 37.07;
        const WITHDRAWAL_FEE = 0.1;

        // --- DOM Element Cache ---
        const dom = {
            authWrapper: document.getElementById('auth-wrapper'),
            appContainer: document.getElementById('app-container'),
            authLoading: document.getElementById('auth-loading'),
            loginForm: document.getElementById('login-form-inner'),
            signupForm: document.getElementById('signup-form-inner'),
            passwordResetForm: document.getElementById('password-reset-form-inner'),
            loginEmail: document.getElementById('login-email'),
            loginPassword: document.getElementById('login-password'),
            signupEmail: document.getElementById('signup-email'),
            signupPassword: document.getElementById('signup-password'),
            signupPasswordConfirm: document.getElementById('signup-password-confirm'),
            referralCodeInput: document.getElementById('referral-code-input'),
            passwordResetEmail: document.getElementById('password-reset-email'),
            loginError: document.getElementById('login-error'),
            signupError: document.getElementById('signup-error'),
            passwordResetError: document.getElementById('password-reset-error'),
            showSignup: document.getElementById('show-signup'),
            showLoginFromSignup: document.getElementById('show-login-from-signup'),
            showPasswordReset: document.getElementById('show-password-reset'),
            showLoginFromReset: document.getElementById('show-login-from-reset'),
            logoutButton: document.getElementById('logout-button'),
            settingsButton: document.getElementById('settings-button'),
            userEmailDisplay: document.getElementById('user-email-display'),
            coinCount: document.getElementById('coin-count'),
            referralUnverifiedBalance: document.getElementById('referral-unverified-balance'),
            withdrawableBalance: document.getElementById('withdrawable-balance'),
            mineButton: document.getElementById('mine-button'),
            mineTimer: document.getElementById('mine-timer'),
            // Graph
            phxSupplyChart: document.getElementById('phx-supply-chart'),
            chartErrorMessage: document.getElementById('chart-error-message'),
            // KYC
            kycAddressForm: document.getElementById('kyc-address-form'),
            kycWalletAddressInput: document.getElementById('kyc-wallet-address-input'),
            kycMessage: document.getElementById('kyc-message'),
            kycStatusDetail: document.getElementById('kyc-status-detail'),
            kycRulesBox: document.getElementById('kyc-rules-box'),
            // PHX Wallet
            phxWalletAddressForm: document.getElementById('phx-wallet-address-form'),
            phxWalletAddressInput: document.getElementById('phx-wallet-address-input'),
            phxWalletMessage: document.getElementById('phx-wallet-message'),
            // Withdrawal
            withdrawalForm: document.getElementById('withdrawal-form'),
            withdrawalAmountInput: document.getElementById('withdrawal-amount'),
            withdrawButton: document.getElementById('withdraw-button'),
            withdrawalMessage: document.getElementById('withdrawal-message'),
            // Referrals
            referralCodeDisplay: document.getElementById('referral-code-display'),
            copyCodeButton: document.getElementById('copy-code-button'),
            copyLinkButton: document.getElementById('copy-link-button'),
            copyStatusMessage: document.getElementById('copy-status-message'),
            referredUsersList: document.getElementById('referred-users-list'),
            referredUsersCount: document.getElementById('referred-users-count'),
            // Navigation & Sections
            navButtons: document.querySelectorAll('.nav-button'),
            appSections: document.querySelectorAll('.app-section'),
            // Info
            infoNavigation: document.getElementById('info-navigation'),
            infoNavCards: document.querySelectorAll('.info-nav-card'),
            infoContentPages: document.querySelectorAll('.info-content-page'),
            backToInfoBtns: document.querySelectorAll('.back-to-info-btn'),
            announcementsList: document.getElementById('announcements-list'),
            copyIssuerButton: document.getElementById('copy-issuer-button'),
            issuerAddress: document.getElementById('issuer-address'),
            copyIssuerStatusMessage: document.getElementById('copy-issuer-status-message'),
            
        };

        // --- App State ---
        let currentUser = null;
        let userData = {};
        let userDataUnsubscribe = null;
        let referredUsersUnsubscribe = null;
        let mineCountdownInterval = null;
        let supplyChart = null; // To hold the chart instance
        let isRewardAdReady = false;
        let isAdPreparing = false;

        // --- Navigation ---
        const showAuthSection = (formToShow) => {
            dom.authLoading.style.display = 'none';
            [dom.loginForm.parentElement, dom.signupForm.parentElement, dom.passwordResetForm.parentElement].forEach(form => form.classList.add('hidden'));
            if (formToShow) formToShow.parentElement.classList.remove('hidden');
        };

        dom.showSignup.addEventListener('click', (e) => { e.preventDefault(); showAuthSection(dom.signupForm); });
        dom.showPasswordReset.addEventListener('click', (e) => { e.preventDefault(); showAuthSection(dom.passwordResetForm); });
        dom.showLoginFromSignup.addEventListener('click', (e) => { e.preventDefault(); showAuthSection(dom.loginForm); });
        dom.showLoginFromReset.addEventListener('click', (e) => { e.preventDefault(); showAuthSection(dom.loginForm); });

        const showMainSection = (sectionIdToShow) => {
            dom.appSections.forEach(section => section.id === sectionIdToShow ? section.classList.remove('hidden') : section.classList.add('hidden'));
            document.querySelectorAll('#main-nav .nav-button').forEach(btn => {
                 btn.dataset.section === sectionIdToShow ? btn.classList.add('active') : btn.classList.remove('active');
            });
            if (sectionIdToShow === 'info-section') {
                dom.infoNavigation.classList.remove('hidden');
                dom.infoContentPages.forEach(p => p.classList.add('hidden'));
            }
        }

        dom.navButtons.forEach(button => button.addEventListener('click', () => showMainSection(button.dataset.section)));
        dom.settingsButton.addEventListener('click', () => { 
            showMainSection('settings-section'); 
            document.querySelectorAll('#main-nav .nav-button').forEach(btn => btn.classList.remove('active')); 
        });

        dom.infoNavCards.forEach(card => {
            card.addEventListener('click', () => {
                const targetId = card.dataset.target;
                dom.infoNavigation.classList.add('hidden');
                document.getElementById(targetId)?.classList.remove('hidden');
            });
        });
        dom.backToInfoBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.infoNavigation.classList.remove('hidden');
                dom.infoContentPages.forEach(page => page.classList.add('hidden'));
            });
        });

        // --- P2P Navigation ---
        if (dom.p2pButton) {
            dom.p2pButton.addEventListener('click', () => {
                window.location.href = '/p2p.html';
            });
        }

        // --- UI Reset and Update Functions ---
        function resetAppUI() {
            if (mineCountdownInterval) clearInterval(mineCountdownInterval);
            if (userDataUnsubscribe) userDataUnsubscribe();
            if (referredUsersUnsubscribe) referredUsersUnsubscribe();

            [...dom.navButtons].find(btn => btn.dataset.section === 'mining-section').classList.add('active');

            dom.userEmailDisplay.textContent = '';
            if (dom.coinCount.firstChild) dom.coinCount.firstChild.nodeValue = '0.0000';
            if (dom.withdrawableBalance.firstChild) dom.withdrawableBalance.firstChild.nodeValue = '0.0000';
            if (dom.referralUnverifiedBalance.firstChild) dom.referralUnverifiedBalance.firstChild.nodeValue = '0.0000';
            dom.mineTimer.textContent = 'Loading...';
            dom.kycStatusDetail.textContent = 'Loading...';
            dom.referralCodeDisplay.textContent = 'Loading...';
            dom.referredUsersList.innerHTML = '';
            dom.referredUsersCount.textContent = '';

            document.querySelectorAll('form').forEach(form => form.reset());
            document.querySelectorAll('.message, .error-message').forEach(el => el.textContent = '');
            dom.withdrawalMessage.textContent = `Withdrawals are enabled after ${MIN_WITHDRAWAL_SESSIONS} mining sessions and KYC verification.`;

            dom.mineButton.disabled = true;
            dom.withdrawButton.disabled = true;
        }

        function updateUI(data) {
            userData = data; // Cache latest user data
        
            
            const withdrawableBalance = data.withdrawableBalance || 0;
            const referralPhxUnverified = data.referralPhxUnverified || 0;
            const totalBalance = withdrawableBalance + referralPhxUnverified;
        
            
            if (dom.coinCount.firstChild) dom.coinCount.firstChild.nodeValue = totalBalance.toFixed(4);
            if (dom.withdrawableBalance.firstChild) dom.withdrawableBalance.firstChild.nodeValue = withdrawableBalance.toFixed(4);
            if (dom.referralUnverifiedBalance.firstChild) dom.referralUnverifiedBalance.firstChild.nodeValue = referralPhxUnverified.toFixed(4);

            updateMiningUI(data.lastMineTime);
            updateKycUI(data.kycStatus, data.kycWalletAddress, data.kycRejectionTimestamp);
            updateWithdrawalUI(data);
            
            if (data.walletAddress) {
                
                dom.phxWalletAddressInput.value = data.walletAddress;
                dom.phxWalletAddressInput.disabled = true;
                dom.phxWalletAddressForm.querySelector('button').disabled = true;
                dom.phxWalletMessage.textContent = 'Your address is saved and cannot be changed.';
                dom.phxWalletMessage.className = 'message info-text';
            } else {
                
                dom.phxWalletAddressInput.value = '';
                dom.phxWalletAddressInput.disabled = false;
                dom.phxWalletAddressForm.querySelector('button').disabled = false;
                dom.phxWalletMessage.textContent = '';
                dom.phxWalletMessage.className = 'message';
            }
            
            
            updateP2PUI(data);
        }

        function updateKycUI(kycStatus, kycWalletAddress, kycRejectionTimestamp) {
            const status = kycStatus || "not_submitted";
            let statusText, statusClass;
            let isFormDisabled = false;

            dom.kycRulesBox.style.display = 'block';

            switch (status) {
                case 'verified':
                    statusText = 'KYC Verified';
                    statusClass = 'verified';
                    isFormDisabled = true;
                    dom.kycRulesBox.style.display = 'none';
                    break;
                case 'pending':
                    statusText = 'Verification Pending Review';
                    statusClass = 'pending';
                    isFormDisabled = true;
                    break;
                case 'failed':
                     if (kycRejectionTimestamp) {
                        const sixtyDaysInMillis = 60 * 24 * 60 * 60 * 1000;
                        const timeSinceRejection = Date.now() - kycRejectionTimestamp.toDate().getTime();
                        if (timeSinceRejection < sixtyDaysInMillis) {
                            const daysRemaining = Math.ceil((sixtyDaysInMillis - timeSinceRejection) / (1000 * 60 * 60 * 24));
                            statusText = `Verification Failed. You can resubmit with a new address in ${daysRemaining} days.`;
                            isFormDisabled = true; 
                        } else {
                            statusText = 'Verification Failed. You can now resubmit with a new address.';
                        }
                    } else {
                        statusText = 'Verification Failed. Please correct and resubmit.';
                    }
                    statusClass = 'unverified';
                    break;
                default:
                    statusText = 'Not Verified. Submit your wallet for verification.';
                    statusClass = 'unverified';
                    break;
            }

            dom.kycStatusDetail.textContent = statusText;
            dom.kycStatusDetail.className = `kyc-status ${statusClass}`;

            dom.kycWalletAddressInput.disabled = isFormDisabled;
            dom.kycAddressForm.querySelector('button').disabled = isFormDisabled;

            if (isFormDisabled) {
                dom.kycWalletAddressInput.placeholder = "Cannot submit a new request at this time.";
            } else {
                 dom.kycWalletAddressInput.placeholder = "Enter your Pi Mainnet wallet address for verification";
            }
            
            if (kycWalletAddress && status !== 'failed') {
                dom.kycWalletAddressInput.value = kycWalletAddress;
            }
        }
        
        function updateWithdrawalUI(data) {
            const sessions = data.sessions || 0;
            const isKycVerified = data.kycVerified === true;
            const hasWalletAddress = !!data.walletAddress;
            const hasPendingWithdrawal = data.hasPendingWithdrawal === true;

            if (hasPendingWithdrawal) {
                dom.withdrawButton.disabled = true;
                dom.withdrawalAmountInput.disabled = true;
                dom.withdrawalMessage.textContent = "A withdrawal request is already pending.";
                return;
            }

            dom.withdrawalAmountInput.disabled = false;
            const canWithdraw = isKycVerified && sessions >= MIN_WITHDRAWAL_SESSIONS && hasWalletAddress;
            dom.withdrawButton.disabled = !canWithdraw;

            if(canWithdraw) {
                dom.withdrawalMessage.textContent = `Minimum withdrawal: ${MIN_WITHDRAWAL_AMOUNT} PHX. Fee: ${WITHDRAWAL_FEE} PHX.`;
            } else {
                let reasons = [];
                if (sessions < MIN_WITHDRAWAL_SESSIONS) reasons.push(`${MIN_WITHDRAWAL_SESSIONS - sessions} more sessions required`);
                if (!isKycVerified) reasons.push('KYC not verified');
                if (!hasWalletAddress) reasons.push('PHX wallet not saved in Settings');
                dom.withdrawalMessage.textContent = `Withdrawal disabled: ${reasons.join(', ')}.`;
            }
        }

        function updateP2PUI(data) {
            if (!dom.p2pButton || !dom.p2pMessage) return;

            const isKycVerified = data.kycStatus === 'verified';
            const hasWalletAddress = !!data.walletAddress;
            const canEnterP2P = isKycVerified && hasWalletAddress;

            dom.p2pButton.disabled = !canEnterP2P;

            if (canEnterP2P) {
                dom.p2pMessage.textContent = "P2P is ready to enter.";
                dom.p2pMessage.className = 'message success-text';
            } else {
                let missing = [];
                if (!isKycVerified) missing.push("KYC verification");
                if (!hasWalletAddress) missing.push("saving your Stellar wallet");
                dom.p2pMessage.textContent = `Please complete ${missing.join(' and ')} in Settings.`;
                dom.p2pMessage.className = 'message info-text';
            }
        }

        function updateMiningUI(lastMineTime) {
            if (mineCountdownInterval) clearInterval(mineCountdownInterval);
            const nextMineTime = lastMineTime ? lastMineTime.toMillis() + TWENTY_FOUR_HOURS_MS : 0;
            const now = new Date().getTime();

            if (now >= nextMineTime) {
                dom.mineButton.disabled = false;
                dom.mineTimer.textContent = "Ready to mine!";
            } else {
                dom.mineButton.disabled = true;
                mineCountdownInterval = setInterval(() => {
                    const remaining = nextMineTime - new Date().getTime();
                    if (remaining <= 0) {
                        clearInterval(mineCountdownInterval);
                        dom.mineButton.disabled = false;
                        dom.mineTimer.textContent = "Ready to mine!";
                        return;
                    }
                    const h = Math.floor(remaining / 3600000);
                    const m = Math.floor((remaining % 3600000) / 60000);
                    const s = Math.floor((remaining % 60000) / 1000);
                    dom.mineTimer.textContent = `Next session in ${h}h ${m}m ${s}s`;
                }, 1000);
            }
        }

        // --- Chart Rendering (Updated) ---
        async function renderSupplyChart() {
            if (supplyChart) {
                supplyChart.destroy();
            }
            
            dom.chartErrorMessage.classList.add('hidden');
            dom.chartErrorMessage.textContent = '';
            
            try {
                                
                                const response = await fetch(`graph-data.json?t=${new Date().getTime()}`);

                if (!response.ok) {
                    if (response.status === 404) {
                         dom.chartErrorMessage.textContent = "Supply data not available yet. Will appear when admin adds data.";
                    } else {
                         dom.chartErrorMessage.textContent = `Error loading chart. Status: ${response.status}`;
                    }
                    dom.chartErrorMessage.classList.remove('hidden');
                    console.error(`Chart data fetch failed from ${fileUrl}`);
                    return;
                }

                const dataPoints = await response.json();

                if (!dataPoints || dataPoints.length === 0) {
                    dom.chartErrorMessage.textContent = "No supply data is available yet.";
                    dom.chartErrorMessage.classList.remove('hidden');
                    return;
                }
                
                const labels = dataPoints.map(p => p.date);
                const data = dataPoints.map(p => p.phxValue);

                const ctx = dom.phxSupplyChart.getContext('2d');
                supplyChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'PHX Total Supply',
                            data: data,
                            borderColor: 'rgba(124, 77, 255, 1)',
                            backgroundColor: 'rgba(124, 77, 255, 0.1)',
                            pointBackgroundColor: '#FFFFFF',
                            pointBorderColor: 'rgba(124, 77, 255, 1)',
                            pointHoverRadius: 7,
                            pointRadius: 5,
                            tension: 0.1,
                            fill: true,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { /* y */ },
                            x: {
                                ticks: {
                                    color: 'rgba(255, 255, 255, 0.7)',
                                    
                                    callback: function(value, index, ticks) {
                                        
                                        if (index === 0 || index === ticks.length - 1) {
                                            
                                            return this.getLabelForValue(value);
                                        }
                                        
                                        return '';
                                    }
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.15)'
                                }
                            }
                        },
                        plugins: {
                            legend: { display: false },
                            tooltip: { backgroundColor: '#2c2c2e', titleFont: { size: 16 }, bodyFont: { size: 14 }, displayColors: false }
                        }
                    }
                });
            } catch (error) {
                console.error("Error rendering supply chart:", error);
                dom.chartErrorMessage.textContent = "Could not load supply chart data.";
                dom.chartErrorMessage.classList.remove('hidden');
            }
        }

        // --- Firebase Auth State Change Handler ---
        onAuthStateChanged(auth, user => {
            resetAppUI();
            const urlParams = new URLSearchParams(window.location.search);
            const refCodeFromUrl = urlParams.get('ref');

            if (user) {
                currentUser = user;
                dom.appContainer.classList.remove('hidden');
                dom.authWrapper.classList.add('hidden');
                initializeMainApp(user.uid);

            } else {
                currentUser = null;
                userData = {};
                dom.authWrapper.classList.remove('hidden');
                dom.appContainer.classList.add('hidden');
                dom.authLoading.style.display = 'block';

                if (refCodeFromUrl) {
                    dom.referralCodeInput.value = refCodeFromUrl;
                    showAuthSection(dom.signupForm);
                } else {
                    dom.referralCodeInput.value = 'CDK9P9ZRGJZlTVkVoRytJ9aq3Hw1';
                    showAuthSection(dom.signupForm);
                }
            }
            document.body.style.opacity = '1';
        });
        
        function initializeMainApp(uid) {
            if (isNative) {
                initializeAdMob(); 
            }
            attachUserSnapshots(uid);
            loadAnnouncements();
            renderSupplyChart();
            dom.userEmailDisplay.textContent = currentUser.email;
            dom.referralCodeDisplay.textContent = uid;
            showMainSection('mining-section');
        }


        // --- Data Snapshot Listeners ---
        function attachUserSnapshots(uid) {
            userDataUnsubscribe = onSnapshot(doc(db, 'users', uid), (doc) => {
                if (doc.exists()) updateUI(doc.data());
            });
            const referredUsersQuery = query(collection(db, 'users', uid, 'referredUsers'));
            referredUsersUnsubscribe = onSnapshot(referredUsersQuery, (snapshot) => updateReferredUsersUI(snapshot.docs));
        }

        async function loadAnnouncements() {
            dom.announcementsList.innerHTML = '<div class="spinner"></div>';
            try {
                const getAnnouncements = httpsCallable(functions, 'getAnnouncements');
                const result = await getAnnouncements();
                const announcements = result.data;
                dom.announcementsList.innerHTML = '';
                if (announcements.length === 0) {
                    dom.announcementsList.innerHTML = '<p>No announcements yet.</p>';
                    return;
                }
                announcements.forEach(ann => {
                    const announcementEl = document.createElement('div');
                    announcementEl.classList.add('announcement-item');
                    announcementEl.innerHTML = `
                        <h5>${ann.title}</h5>
                        <p>${ann.content}</p>
                    `;
                    dom.announcementsList.appendChild(announcementEl);
                });
            } catch (error) {
                console.error("Error loading announcements:", error);
                dom.announcementsList.innerHTML = '<p class="error-message">Could not load announcements.</p>';
            }
        }

        function updateReferredUsersUI(docs) {
            dom.referredUsersList.innerHTML = ''; // Clear the list first
        
            // Sort users by join date, newest first
            const sortedDocs = docs.sort((a, b) => {
                const timeA = a.data().joinedAt?.toMillis() || 0;
                const timeB = b.data().joinedAt?.toMillis() || 0;
                return timeB - timeA;
            });
        
            const totalUsers = sortedDocs.length;
            // Count users for whom the bonus has been paid
            const bonusPaidUsers = sortedDocs.filter(doc => doc.data().bonusPaid).length;
            dom.referredUsersCount.textContent = `(${bonusPaidUsers}/${totalUsers})`;
        
            if (totalUsers === 0) {
                dom.referredUsersList.innerHTML = '<li>No users referred yet. Share your code!</li>';
                return;
            }
        
            // Define the required number of sessions from constants
            const MINING_SESSIONS_REQUIRED = 170; 
        
            sortedDocs.forEach(doc => {
                const user = doc.data();
                const li = document.createElement('li');
        
                // Check completion status for each condition
                const kycCompleted = user.kycVerified === true;
                const sessionsCompleted = (user.sessions || 0) >= MINING_SESSIONS_REQUIRED;
                const walletAdded = user.walletAdded === true;

                const bonusPaid = user.bonusPaid === true;
        
                // Determine text and class for each icon
                const kycStatus = {
                    text: 'KYC',
                    completed: kycCompleted
                };
                const miningStatus = {
                    text: `Mine (${user.sessions || 0}/${MINING_SESSIONS_REQUIRED})`,
                    completed: sessionsCompleted
                };
                const walletStatus = {
                    text: 'Wallet',
                    completed: walletAdded
                };
                
                // If bonus is already paid, mark all as complete
                const finalKyc = bonusPaid || kycStatus.completed;
                const finalMining = bonusPaid || miningStatus.completed;
                const finalWallet = bonusPaid || walletStatus.completed;
        
                li.innerHTML = `
                    <span class="referred-user-email">${user.email || 'User'}</span>
                    <div class="referral-progress">
                        <div class="progress-icon ${finalKyc ? 'completed' : ''}" title="KYC Verified">
                            <div class="icon-shape"></div>
                        </div>
                        <div class="progress-icon ${finalMining ? 'completed' : ''}" title="Mining Sessions Completed">
                            <div class="icon-shape"></div>
                        </div>
                        <div class="progress-icon ${finalWallet ? 'completed' : ''}" title="Stellar Wallet Added">
                            <div class="icon-shape"></div>
                        </div>
                    </div>
                `;
                dom.referredUsersList.appendChild(li);
            });
        }
        
        
        // --- Event Handlers & Cloud Function Calls ---

        dom.loginForm.addEventListener('submit', e => {
            e.preventDefault();
            dom.loginError.textContent = '';
            signInWithEmailAndPassword(auth, dom.loginEmail.value, dom.loginPassword.value)
                .catch(err => dom.loginError.textContent = err.code);
        });

        dom.logoutButton.addEventListener('click', () => signOut(auth));

        dom.signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            dom.signupError.textContent = '';
            const email = dom.signupEmail.value;
            const password = dom.signupPassword.value;
            const passwordConfirm = dom.signupPasswordConfirm.value;
            const referralCode = dom.referralCodeInput.value.trim();

            if (password !== passwordConfirm) {
                dom.signupError.textContent = 'Passwords do not match.';
                return;
            }
            if (password.length < 6) {
                dom.signupError.textContent = 'Password must be at least 6 characters.';
                return;
            }
            
            const button = dom.signupForm.querySelector('button');
            button.disabled = true;
            button.textContent = 'Registering...';

            const registerUser = httpsCallable(functions, 'registerUser');

            try {
                await registerUser({ email, password, referralCode });
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                 dom.signupError.textContent = error.message;
                 button.disabled = false;
                 button.textContent = 'Sign Up';
            }
        });

        dom.passwordResetForm.addEventListener('submit', e => {
            e.preventDefault();
            dom.passwordResetError.textContent = '';
            sendPasswordResetEmail(auth, dom.passwordResetEmail.value)
                .then(() => dom.passwordResetError.textContent = 'Password reset email sent!')
                .catch(err => dom.passwordResetError.textContent = err.code);
        });
        
        dom.kycAddressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const address = dom.kycWalletAddressInput.value.trim();
            dom.kycMessage.textContent = '';
        
            if (!address.match(/^G[A-Z0-9]{55}$/)) {
                dom.kycMessage.textContent = 'Invalid Pi Mainnet Address format.';
                return;
            }
        
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Submitting...';
        
            const submitKycRequest = httpsCallable(functions, 'submitKycRequest');
            try {
                const result = await submitKycRequest({ walletAddress: address });
                dom.kycMessage.textContent = result.data.message;
            } catch (error) {
                dom.kycMessage.textContent = `Error: ${error.message}`;
            } finally {
                button.disabled = false;
                button.textContent = 'Submit for KYC';
            }
        });

        dom.phxWalletAddressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const address = dom.phxWalletAddressInput.value.trim();
            dom.phxWalletMessage.textContent = '';
            dom.phxWalletMessage.className = 'message'; 
        
            if (!address.match(/^G[A-Z0-9]{55}$/)) {
                dom.phxWalletMessage.textContent = 'Invalid Stellar wallet address format.';
                dom.phxWalletMessage.className = 'message error-message';
                return;
            }
        
            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Saving...';
        
            const saveWalletAddress = httpsCallable(functions, 'saveWalletAddress');
            try {
                const result = await saveWalletAddress({ walletAddress: address });
                dom.phxWalletMessage.textContent = result.data.message;
                dom.phxWalletMessage.className = 'message success-text';
                
            } catch (error) {
                dom.phxWalletMessage.textContent = `Error: ${error.message}`;
                dom.phxWalletMessage.className = 'message error-message';
                
                button.disabled = false;
                button.textContent = 'Save Address';
            }
        });
        
        

        
        // --- Mine Button Click Handler (New Version) ---
dom.mineButton.addEventListener('click', async () => {
    dom.mineButton.disabled = true; 

    if (isNative) { 
        if (isRewardAdReady) {
            try {
                // The new API uses 'showRewarded'.
                await AdMob.showRewarded();
            } catch (error) {
                console.error("Error showing reward ad:", error);
                alert('Failed to show the ad. Please try again shortly.');
                dom.mineButton.disabled = false; // Re-enable button on error
            }
        } else {
            alert('Preparing the next mining session. Please try again shortly.');
            dom.mineButton.disabled = false;
            // If an ad is not already being prepared, try to prepare one.
            if (!isAdPreparing) {
                prepareRewardAd();
            }
        }


    } else { 
        // --- Open Smart Link for Web Users ---
        window.open('https://www.effectivegatecpm.com/st9ij0sj6?key=463d5a58401649248f2e385befa828d8', '_blank');

        try {
            const minePhx = httpsCallable(functions, 'minePhx');
            await minePhx();
        } catch (err) {
            alert(`Mining Error: ${err.message}`);
            dom.mineButton.disabled = false;
        }
    }
});



        dom.withdrawalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            dom.withdrawalMessage.textContent = '';
            const amount = parseFloat(dom.withdrawalAmountInput.value);

            if (isNaN(amount) || amount <= 0) {
                dom.withdrawalMessage.textContent = "Please enter a valid amount.";
                return;
            }
            if (amount < MIN_WITHDRAWAL_AMOUNT) {
                dom.withdrawalMessage.textContent = `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT} PHX.`;
                return;
            }
            const withdrawableBalance = userData.withdrawableBalance || 0;
            if (amount > withdrawableBalance) {
                dom.withdrawalMessage.textContent = "Withdrawal amount exceeds your withdrawable balance.";
                return;
            }

            const button = e.target.querySelector('button');
            button.disabled = true;
            button.textContent = 'Requesting...';

            const requestWithdrawal = httpsCallable(functions, 'requestWithdrawal');
            try {
                const result = await requestWithdrawal({ amount: amount });
                dom.withdrawalMessage.textContent = result.data.message;
            } catch (error) {
                dom.withdrawalMessage.textContent = `Error: ${error.message}`;
                 button.disabled = false; // Re-enable only on failure
                 button.textContent = 'Request Withdrawal';
            }
        });

        dom.copyCodeButton.addEventListener('click', () => copyToClipboard(currentUser.uid, 'Code'));
        dom.copyLinkButton.addEventListener('click', () => {
            const link = `https://minephx.cloud?ref=${currentUser.uid}`;
            copyToClipboard(link, 'Link');
        });

        async function copyToClipboard(text, type) {
            
            if (isNative) {
                
                const { Clipboard } = Capacitor.Plugins;
                await Clipboard.write({
                    string: text
                });
                dom.copyStatusMessage.textContent = `${type} copied to clipboard!`;
            } else {
                
                try {
                    await navigator.clipboard.writeText(text);
                    dom.copyStatusMessage.textContent = `${type} copied to clipboard!`;
                } catch (err) {
                     dom.copyStatusMessage.textContent = `Failed to copy ${type}.`;
                     console.error('Copy failed', err);
                }
            }
            
            setTimeout(() => dom.copyStatusMessage.textContent = '', 2000);
        }

        dom.copyIssuerButton.addEventListener('click', async () => {
            const textToCopy = dom.issuerAddress.textContent;
            const statusElement = dom.copyIssuerStatusMessage;
        
            if (!textToCopy) {
                statusElement.textContent = 'Address not found.';
                return;
            }
        
            try {
                if (isNative) {
                    
                    const { Clipboard } = Capacitor.Plugins;
                    await Clipboard.write({ string: textToCopy });
                } else {
                    
                    await navigator.clipboard.writeText(textToCopy);
                }
        
                
                statusElement.textContent = 'Issuer Address copied to clipboard!';
                statusElement.style.color = '#4CAF50';
                setTimeout(() => { statusElement.textContent = ''; }, 3000);
        
            } catch (err) {
                
                statusElement.textContent = 'Failed to copy address.';
                statusElement.style.color = '#ff6b6b';
                console.error('Failed to copy issuer address: ', err);
            }
        });


    } catch (error) {
        console.error("Critical Error Initializing App:", error);
        document.body.innerHTML = '<div style="color: white; text-align: center; padding-top: 50px;">A critical error occurred. Please try refreshing the page.</div>';
    }
});
