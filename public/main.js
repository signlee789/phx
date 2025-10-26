
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, doc, onSnapshot, updateDoc, collection, query, where, orderBy, getDocs, getDoc, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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

            daoNavButtons: document.querySelectorAll('.dao-nav-button'),
            daoContentPages: document.querySelectorAll('.dao-content-page'),

            announcementsList: document.getElementById('announcements-list'),
            copyIssuerButton: document.getElementById('copy-issuer-button'),
            issuerAddress: document.getElementById('issuer-address'),
            copyIssuerStatusMessage: document.getElementById('copy-issuer-status-message'),
            // xlmdonation
    xlmDonationAddress: document.getElementById('xlm-donation-address'),
    copyXlmDonationButton: document.getElementById('copy-xlm-donation-button'),
    copyXlmStatusMessage: document.getElementById('copy-xlm-status-message'),
    donationLeaderboard: document.getElementById('donation-leaderboard'),

    communityContent: document.getElementById('community-content'),
createCommunityPostBtn: document.getElementById('create-community-post-btn'),
communityPostFormContainer: document.getElementById('community-post-form-container'),
communityPostForm: document.getElementById('community-post-form'),
communityPostTitle: document.getElementById('community-post-title'),
communityPostContent: document.getElementById('community-post-content'),
cancelCommunityPostBtn: document.getElementById('cancel-community-post-btn'),
communityPostFormMessage: document.getElementById('community-post-form-message'),
communityPostsListContainer: document.getElementById('community-posts-list-container'),

        };

// --------------------------------------------------------------------------------
// Community Board Feature (Final Corrected Version)
// --------------------------------------------------------------------------------

let communityPostsUnsubscribe = null;

// Helper function to escape HTML to prevent XSS attacks
const escapeHTML = (str) => {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
};

// --- Event Listeners for Community Board ---

// Event listener for showing the post creation form
if (dom.createCommunityPostBtn) {
    dom.createCommunityPostBtn.addEventListener('click', () => {
        // Check eligibility using the global 'userData' object
        if (userData && userData.kycStatus === 'verified' && userData.walletAddress) {
            dom.communityPostFormContainer.classList.remove('hidden');
            dom.createCommunityPostBtn.classList.add('hidden');
        } else {
            // Use 'alert' as no general-purpose toast/modal function exists in this project
            alert("Post creation requires KYC verification and a saved Stellar wallet in Settings.");
        }
    });
}

// Event listener for canceling post creation
if (dom.cancelCommunityPostBtn) {
    dom.cancelCommunityPostBtn.addEventListener('click', () => {
        dom.communityPostFormContainer.classList.add('hidden');
        dom.createCommunityPostBtn.classList.remove('hidden');
        dom.communityPostForm.reset();
        if(dom.communityPostFormMessage) dom.communityPostFormMessage.textContent = '';
    });
}

// Event listener for submitting a new post
if (dom.communityPostForm) {
    dom.communityPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = dom.communityPostTitle.value.trim();
        const content = dom.communityPostContent.value.trim();
        const messageEl = dom.communityPostFormMessage;

        // Manually handle form messages, following the project's existing style
        if (!title || !content) {
            messageEl.textContent = "Title and content are required.";
            messageEl.className = 'message error-message';
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            messageEl.textContent = "You must be logged in to post.";
            messageEl.className = 'message error-message';
            return;
        }

        const postButton = dom.communityPostForm.querySelector('button[type="submit"]');
        // Manually handle button loading state, following the project's existing style
        postButton.disabled = true;
        postButton.textContent = 'Submitting...';
        messageEl.textContent = ''; // Clear previous errors

        try {
            // Use the correct modular Firebase functions (imported at the top)
            await addDoc(collection(db, "communityPosts"), {
                title: title,
                content: content,
                authorUid: user.uid,
                authorAddress: userData.walletAddress,
                createdAt: serverTimestamp()
            });

            dom.communityPostFormContainer.classList.add('hidden');
            dom.createCommunityPostBtn.classList.remove('hidden');
            dom.communityPostForm.reset();
            alert("Your post has been published!"); // Use alert for success

        } catch (error) {
            console.error("Error creating community post: ", error);
            messageEl.textContent = "An error occurred. Please try again.";
            messageEl.className = 'message error-message';
        } finally {
            // Manually restore button state
            postButton.disabled = false;
            postButton.textContent = 'Submit Post';
        }
    });

    // Use event delegation for comment forms
if (dom.communityPostsListContainer) {
    dom.communityPostsListContainer.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Ensure the event is from a comment form
        if (!e.target.matches('.comment-form')) {
            return;
        }

        const form = e.target;
        const input = form.querySelector('.comment-input');
        const button = form.querySelector('button');
        const commentText = input.value.trim();

        if (!commentText) return;

        const postItem = form.closest('.community-post-item');
        const postId = postItem.dataset.id;
        
        const user = auth.currentUser;
        if (!user || !userData.walletAddress) {
            alert("You must be logged in and have a saved wallet to comment.");
            return;
        }

        button.disabled = true;

        try {
            await addDoc(collection(db, 'communityPosts', postId, 'comments'), {
                text: commentText,
                authorUid: user.uid,
                authorAddress: userData.walletAddress,
                createdAt: serverTimestamp()
            });
            form.reset(); // Clear the input field on success
        } catch (error) {
            console.error("Error adding comment: ", error);
            alert("Failed to post comment. Please try again.");
        } finally {
            button.disabled = false;
        }
    });
}

}

/**
 * Fetches and renders community posts from Firestore in real-time.
 * This function is correctly called when the user logs in.
 */
function listenForCommunityPosts() {
    if (!dom.communityPostsListContainer) return;

    if (communityPostsUnsubscribe) {
        communityPostsUnsubscribe(); // Detach previous listener
    }

    // Show a loading spinner, following the project's existing style
    dom.communityPostsListContainer.innerHTML = '<div class="spinner"></div>';

    // Use the correct modular Firebase functions
    const postsCollection = collection(db, "communityPosts");
    const q = query(postsCollection, orderBy("createdAt", "desc"));

    communityPostsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        dom.communityPostsListContainer.innerHTML = ''; // Clear spinner/old content

        if (querySnapshot.empty) {
            dom.communityPostsListContainer.innerHTML = '<p>No posts yet. Be the first to start a conversation!</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const post = doc.data();
            const postItem = document.createElement('div');
            postItem.className = 'community-post-item';
            postItem.dataset.id = doc.id;

            const creationDate = post.createdAt ? post.createdAt.toDate().toLocaleString() : 'Just now';

            const author = post.authorAddress 
            ? `${post.authorAddress.substring(0, 6)}...${post.authorAddress.substring(post.authorAddress.length - 6)}`
            : 'Anonymous';

        postItem.innerHTML = `
            <div class="post-header">
                <h5 class="post-title">${escapeHTML(post.title)}</h5>
                <div class="post-meta">
                    by <span class="post-author">${escapeHTML(author)}</span>
                </div>
            </div>
            <p class="post-content">${escapeHTML(post.content)}</p>
            <div class="post-footer">
                <span>${creationDate}</span>
            </div>
            
            <!-- Comments Section START -->
            <div class="comments-container">
                <div class="comments-list">
                    <!-- Comments will be loaded here by JavaScript -->
                </div>
                <form class="comment-form">
                    <input type="text" class="comment-input" placeholder="Add a comment..." required>
                    <button type="submit">Post</button>
                </form>
            </div>
            <!-- Comments Section END -->
        `;


            dom.communityPostsListContainer.appendChild(postItem);
            loadAndRenderComments(doc.id, postItem.querySelector('.comments-list'));

        });

    }, (error) => {
        console.error("Error fetching community posts: ", error);
        // Display error inside the container, following the project's existing style
        dom.communityPostsListContainer.innerHTML = '<p class="error-message">Could not load posts. Please check your connection or try again later.</p>';
    });
}

function loadAndRenderComments(postId, containerElement) {
    const commentsCollection = collection(db, 'communityPosts', postId, 'comments');
    const q = query(commentsCollection, orderBy("createdAt", "asc"));

    onSnapshot(q, (querySnapshot) => {
        containerElement.innerHTML = ''; // Clear old comments
        querySnapshot.forEach((doc) => {
            const comment = doc.data();
            const commentItem = document.createElement('div');
            commentItem.className = 'comment-item';

            const commentAuthor = comment.authorAddress
                ? `${comment.authorAddress.substring(0, 6)}...${comment.authorAddress.substring(comment.authorAddress.length - 6)}`
                : 'Anonymous';
            
            const creationDate = comment.createdAt ? comment.createdAt.toDate().toLocaleTimeString() : '';

            commentItem.innerHTML = `
                <span class="comment-author">${escapeHTML(commentAuthor)}:</span>
                <span class="comment-text">${escapeHTML(comment.text)}</span>
            `;
            containerElement.appendChild(commentItem);
        });
    }, (error) => {
        console.error("Error fetching comments: ", error);
        containerElement.innerHTML = '<p class="error-message-small">Could not load comments.</p>';
    });
}



        async function loadDonationLeaderboard() {
            if (!dom.donationLeaderboard) return;
            dom.donationLeaderboard.innerHTML = '<div class="spinner"></div>'; // Show spinner while loading
            try {
                const getDonationLeaderboard = httpsCallable(functions, 'getDonationLeaderboard');
                const result = await getDonationLeaderboard();
                const leaderboard = result.data; // Assuming the backend returns an array
        
                dom.donationLeaderboard.innerHTML = ''; // Clear spinner
        
                if (!leaderboard || leaderboard.length === 0) {
                    dom.donationLeaderboard.innerHTML = '<li>Be the first to contribute!</li>';
                    return;
                }
        
                leaderboard.forEach((entry, index) => {
                    const li = document.createElement('li');
                    // Shorten the address for display
                    const shortAddress = `${entry.address.substring(0, 6)}...${entry.address.substring(entry.address.length - 6)}`;
                    li.innerHTML = `
                        <div>
                            <span class="leaderboard-rank">#${index + 1}</span>
                            <span class="leaderboard-address">${shortAddress}</span>
                        </div>
                        <span class="leaderboard-amount">${Number(entry.amount).toFixed(2)} XLM</span>
                    `;
                    dom.donationLeaderboard.appendChild(li);
                });
            } catch (error) {
                console.error("Error loading donation leaderboard:", error);
                dom.donationLeaderboard.innerHTML = '<li class="error-message">Could not load leaderboard.</li>';
            }
        }

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
                // Hide main info navigation and show the selected page
                dom.infoNavigation.classList.add('hidden');
                const targetPage = document.getElementById(targetId);
                if (targetPage) {
                    targetPage.classList.remove('hidden');
                }
        
                // If the donation page is being opened, load the leaderboard
                if (targetId === 'donation-content') {
                    loadDonationLeaderboard();
                }
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
                listenForCommunityPosts();

            } else {
                currentUser = null;
                userData = {};
                dom.authWrapper.classList.remove('hidden');
                dom.appContainer.classList.add('hidden');
                dom.authLoading.style.display = 'block';
                if (communityPostsUnsubscribe) communityPostsUnsubscribe();

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
            initDaoSection(auth, db, functions);

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

        dom.copyXlmDonationButton.addEventListener('click', async () => {
            const textToCopy = dom.xlmDonationAddress.textContent;
            const statusElement = dom.copyXlmStatusMessage;
        
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
        
                statusElement.textContent = 'Donation Address copied to clipboard!';
                statusElement.style.color = '#4CAF50';
                setTimeout(() => { statusElement.textContent = ''; }, 3000);
        
            } catch (err) {
                statusElement.textContent = 'Failed to copy address.';
                statusElement.style.color = '#ff6b6b';
                console.error('Failed to copy donation address: ', err);
            }
        });
        


    } catch (error) {
        console.error("Critical Error Initializing App:", error);
        document.body.innerHTML = '<div style="color: white; text-align: center; padding-top: 50px;">A critical error occurred. Please try refreshing the page.</div>';
    }

    
    

});

/**
 * Initializes the entire DAO section, with separate logic for General and Treasury proposals.
 */
function initDaoSection(auth, db, functions) {
    
    // --- DOM Element Cache ---
    const daoNavButtons = document.querySelectorAll('#dao-navigation .dao-nav-button');
    
    // General Tab Elements
    const createGeneralProposalBtn = document.getElementById('create-proposal-btn');
    const generalProposalFormContainer = document.getElementById('general-proposal-form-container');
    const cancelGeneralProposalBtn = document.getElementById('cancel-general-proposal-btn');
    const generalProposalForm = document.getElementById('general-proposal-form');
    const generalProposalFormMessage = document.getElementById('general-proposal-form-message');
    const generalFilterNav = document.getElementById('general-filter-nav');
    const generalProposalLists = {
        active: document.getElementById('general-proposals-list-active'),
        passed: document.getElementById('general-proposals-list-passed'),
        rejected: document.getElementById('general-proposals-list-rejected'),
    };

    // Treasury Tab Elements
    const createTreasuryProposalBtn = document.getElementById('create-treasury-proposal-btn');
    const treasuryProposalFormContainer = document.getElementById('treasury-proposal-form-container');
    const cancelTreasuryProposalBtn = document.getElementById('cancel-treasury-proposal-btn');
    const treasuryProposalForm = document.getElementById('treasury-proposal-form');
    const treasuryProposalFormMessage = document.getElementById('treasury-proposal-form-message');
    const treasuryFilterNav = document.getElementById('treasury-filter-nav');
    const treasuryProposalLists = {
        active: document.getElementById('treasury-proposals-list-active'),
        passed: document.getElementById('treasury-proposals-list-passed'),
        rejected: document.getElementById('treasury-proposals-list-rejected'),
    };


    // --- Cloud Function Callables ---
    const checkDaoEligibility = httpsCallable(functions, 'checkDaoEligibility');
    // General
    const createGeneralProposal = httpsCallable(functions, 'createGeneralProposal');
    const voteOnProposal = httpsCallable(functions, 'voteOnProposal');
    const voteOnProposalRound2 = httpsCallable(functions, 'voteOnProposalRound2');
    // Treasury
    const createTreasuryProposal = httpsCallable(functions, 'createTreasuryProposal');
    const voteOnTreasuryProposalRound1 = httpsCallable(functions, 'voteOnTreasuryProposalRound1');
    const voteOnTreasuryProposalRound2 = httpsCallable(functions, 'voteOnTreasuryProposalRound2');


    // --- Core Rendering Functions ---

    /**
     * Renders proposals for the GENERAL tab.
     */
    async function renderGeneralProposals() {
        if (Object.values(generalProposalLists).some(el => !el)) return;

        try {
            // Check eligibility and show/hide the "New Proposal" button
            const eligibilityResult = await checkDaoEligibility();
            if(createGeneralProposalBtn) createGeneralProposalBtn.style.display = eligibilityResult.data.eligible ? 'block' : 'none';

            Object.values(generalProposalLists).forEach(list => list.innerHTML = '<div class="spinner"></div>');

            const proposalsSnapshot = await getDocs(query(collection(db, 'proposals'), orderBy('createdAt', 'desc')));
            
            let proposals = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            Object.values(generalProposalLists).forEach(list => list.innerHTML = '');
            let proposalCounts = { active: 0, passed: 0, rejected: 0 };

            if (proposals.length > 0) {
                const currentUserUID = auth.currentUser ? auth.currentUser.uid : null;
                proposals.forEach(proposal => {
                    const status = proposal.status || 'unknown';
                    const displayStatus = status.startsWith('active_') ? 'active' : status;
                    const listContainer = generalProposalLists[displayStatus];

                    if (listContainer) {
                        const proposalEl = document.createElement('div');
                        proposalEl.className = 'proposal-item';
                        proposalEl.dataset.proposalId = proposal.id;

                        const voteCounts = proposal.voteCounts || {};
                        let forCount = 0, againstCount = 0, totalVotes = 0, hasVoted = false, roundText = '';

                        if (status === 'active_round1') {
                            forCount = voteCounts.round1_for || 0;
                            againstCount = voteCounts.round1_against || 0;
                            hasVoted = currentUserUID && proposal.round1Votes && proposal.round1Votes[currentUserUID];
                            roundText = 'Round 1: Top 100 Supporters Vote';
                        } else if (status === 'active_round2') {
                            forCount = voteCounts.round2_for || 0;
                            againstCount = voteCounts.round2_against || 0;
                            hasVoted = currentUserUID && proposal.round2Votes && proposal.round2Votes[currentUserUID];
                            roundText = 'Round 2: Final Vote (All KYC Users)';
                        }
                        
                        totalVotes = forCount + againstCount;
                        const forPercentage = totalVotes > 0 ? (forCount / totalVotes) * 100 : 0;
                        const againstPercentage = totalVotes > 0 ? (againstCount / totalVotes) * 100 : 0;
                        
                        const voteButtonsHTML = displayStatus === 'active' && !hasVoted
                            ? `<div class="vote-actions"><button class="vote-btn" data-vote="for">Vote For</button><button class="vote-btn" data-vote="against">Vote Against</button></div><div class="vote-message"></div>`
                            : `<div class="vote-message">${hasVoted ? 'You have already voted in this round.' : ''}</div>`;
                        
                        proposalEl.innerHTML = `
                            <div class="proposal-header">
                                <h5 class="proposal-title">${proposal.title}</h5>
                                <span class="proposal-status-badge status-${displayStatus}">${roundText || status.replace('_', ' ')}</span>
                            </div>
                            <p class="proposal-description">${proposal.description}</p>
                            <div class="vote-summary">
                                <div class="vote-bar">
                                    <div class="vote-bar-for" style="width: ${forPercentage}%"></div>
                                    <div class="vote-bar-against" style="width: ${againstPercentage}%"></div>
                                </div>
                                <div class="vote-counts">
                                    <span>For: ${forCount} (${forPercentage.toFixed(1)}%)</span>
                                    <span>Against: ${againstCount} (${againstPercentage.toFixed(1)}%)</span>
                                </div>
                            </div>
                            ${voteButtonsHTML}
                        `;

                        listContainer.appendChild(proposalEl);
                        proposalCounts[displayStatus]++;
                    }
                });
            }
            
            for (const key in proposalCounts) {
                if (proposalCounts[key] === 0 && generalProposalLists[key]) {
                    generalProposalLists[key].innerHTML = `<li>No ${key} proposals found.</li>`;
                }
            }
        } catch (error) {
            console.error("Error rendering General DAO page:", error);
            Object.values(generalProposalLists).forEach(list => list.innerHTML = `<li class="error-message">Could not load proposals.</li>`);
        }
    }
    
    /**
     * Renders proposals for the TREASURY tab.
     */
    async function renderTreasuryProposals() {
        if (Object.values(treasuryProposalLists).some(el => !el)) return;

        try {
            // Eligibility for Treasury is checked on the backend during creation, button is permanently disabled for now.
            // const eligibilityResult = await checkDaoEligibility();
            // if(createTreasuryProposalBtn) createTreasuryProposalBtn.disabled = !eligibilityResult.data.eligible;
            
            Object.values(treasuryProposalLists).forEach(list => list.innerHTML = '<div class="spinner"></div>');

            const proposalsSnapshot = await getDocs(query(collection(db, 'treasuryProposals'), orderBy('createdAt', 'desc')));
            
            let proposals = proposalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            Object.values(treasuryProposalLists).forEach(list => list.innerHTML = '');
            let proposalCounts = { active: 0, passed: 0, rejected: 0 };

            if (proposals.length > 0) {
                const currentUserUID = auth.currentUser ? auth.currentUser.uid : null;
                proposals.forEach(proposal => {
                    const status = proposal.status || 'unknown';
                    const displayStatus = status.startsWith('active_') ? 'active' : status;
                    const listContainer = treasuryProposalLists[displayStatus];

                    if (listContainer) {
                        const proposalEl = document.createElement('div');
                        proposalEl.className = 'proposal-item';
                        proposalEl.dataset.proposalId = proposal.id;

                        const voteCounts = proposal.voteCounts || {};
                        let forCount = voteCounts.round1_for || voteCounts.round2_for || 0;
                        let againstCount = voteCounts.round1_against || voteCounts.round2_against || 0;
                        let totalVotes = forCount + againstCount;
                        let hasVoted = false, roundText = '';

                        if (status === 'active_round1') {
                            hasVoted = currentUserUID && proposal.round1Votes && proposal.round1Votes[currentUserUID];
                            roundText = 'Round 1: Top 100 (PHX Weighted)';
                        } else if (status === 'active_round2') {
                            forCount = voteCounts.round2_for || 0;
                            againstCount = voteCounts.round2_against || 0;
                            totalVotes = forCount + againstCount;
                            hasVoted = currentUserUID && proposal.round2Votes && proposal.round2Votes[currentUserUID];
                            roundText = 'Round 2: Final Vote (PHX Weighted)';
                        }
                        
                        const forPercentage = totalVotes > 0 ? (forCount / totalVotes) * 100 : 0;
                        const againstPercentage = totalVotes > 0 ? (againstCount / totalVotes) * 100 : 0;
                        
                        const voteButtonsHTML = displayStatus === 'active' && !hasVoted
                            ? `<div class="vote-actions"><button class="vote-btn" data-vote="for">Vote For</button><button class="vote-btn" data-vote="against">Vote Against</button></div><div class="vote-message"></div>`
                            : `<div class="vote-message">${hasVoted ? 'You have already voted in this round.' : ''}</div>`;
                        
                        proposalEl.innerHTML = `
                            <div class="proposal-header">
                                <h5 class="proposal-title">${proposal.title}</h5>
                                <span class="proposal-status-badge status-${displayStatus}">${roundText || status.replace('_', ' ')}</span>
                            </div>
                            <p class="proposal-description">${proposal.description}</p>
                            
                            <!-- Treasury Specific Info -->
                            <div class="proposal-details">
                                <div><strong>Requested Amount:</strong> ${proposal.amount.toLocaleString()} XLM</div>
                                <div><strong>Recipient:</strong> <a href="https://stellar.expert/explorer/public/account/${proposal.recipient}" target="_blank" rel="noopener noreferrer" class="mono-font">${proposal.recipient.substring(0,12)}...</a></div>
                            </div>
                            
                            <div class="vote-summary">
                                <div class="vote-bar">
                                    <div class="vote-bar-for" style="width: ${forPercentage}%"></div>
                                    <div class="vote-bar-against" style="width: ${againstPercentage}%"></div>
                                </div>
                                <div class="vote-counts">
                                    <span>For: ${forCount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} PHX (${forPercentage.toFixed(1)}%)</span>
                                    <span>Against: ${againstCount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} PHX (${againstPercentage.toFixed(1)}%)</span>
                                </div>
                            </div>
                            ${voteButtonsHTML}
                        `;

                        listContainer.appendChild(proposalEl);
                        proposalCounts[displayStatus]++;
                    }
                });
            }
            
            for (const key in proposalCounts) {
                if (proposalCounts[key] === 0 && treasuryProposalLists[key]) {
                    treasuryProposalLists[key].innerHTML = `<li>No ${key} proposals found.</li>`;
                }
            }
        } catch (error) {
            console.error("Error rendering Treasury DAO page:", error);
            Object.values(treasuryProposalLists).forEach(list => list.innerHTML = `<li class="error-message">Could not load proposals.</li>`);
        }
    }
    

    // --- Event Handlers & UI Logic ---

    // Main DAO Tab Navigation
    daoNavButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.dataset.target;
            document.querySelectorAll('.dao-content-page').forEach(page => page.classList.add('hidden'));
            document.getElementById(targetId)?.classList.remove('hidden');

            daoNavButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Call the correct render function based on which tab is now active
            if (targetId === 'general-voting-content') {
                renderGeneralProposals();
                generalFilterNav.querySelector('.filter-btn[data-status="active"]')?.click();
            } else if (targetId === 'treasury-voting-content') {
                renderTreasuryProposals();
                treasuryFilterNav.querySelector('.filter-btn[data-status="active"]')?.click();
            }
        });
    });

    // Filter Navigation (for both tabs)
    [generalFilterNav, treasuryFilterNav].forEach(nav => {
        if (!nav) return;
        nav.addEventListener('click', (e) => {
            if (!e.target.matches('.filter-btn')) return;
            nav.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            const status = e.target.dataset.status;
            const listContainer = nav.nextElementSibling; // Assumes lists are immediately after nav
            listContainer.querySelectorAll('.proposals-list').forEach(list => {
                list.id.endsWith('-' + status) ? list.classList.remove('hidden') : list.classList.add('hidden');
            });
        });
    });

    // Proposal Form Interactions (General)
    createGeneralProposalBtn?.addEventListener('click', () => {
        generalProposalFormContainer.classList.remove('hidden');
        createGeneralProposalBtn.style.display = 'none';
    });
    cancelGeneralProposalBtn?.addEventListener('click', () => {
        generalProposalForm.reset();
        generalProposalFormMessage.textContent = '';
        generalProposalFormContainer.classList.add('hidden');
        createGeneralProposalBtn.style.display = 'block';
    });
    generalProposalForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = e.target.querySelector('#general-proposal-title').value;
        const description = e.target.querySelector('#general-proposal-description').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        try {
            await createGeneralProposal({ title, description });
            generalProposalFormMessage.textContent = 'Success! Refreshing proposals...';
            await renderGeneralProposals();
            setTimeout(() => {
                cancelGeneralProposalBtn.click();
                generalFilterNav.querySelector('.filter-btn[data-status="active"]')?.click();
            }, 2000);
        } catch (error) {
            generalProposalFormMessage.textContent = `Error: ${error.message}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Proposal';
        }
    });

    // Proposal Form Interactions (Treasury - currently disabled but logic is ready)
    createTreasuryProposalBtn?.addEventListener('click', () => {
        treasuryProposalFormContainer.classList.remove('hidden');
        createTreasuryProposalBtn.style.display = 'none';
    });
    cancelTreasuryProposalBtn?.addEventListener('click', () => {
        treasuryProposalForm.reset();
        treasuryProposalFormMessage.textContent = '';
        treasuryProposalFormContainer.classList.add('hidden');
        createTreasuryProposalBtn.style.display = 'block'; // Or 'inline-block'
    });
    treasuryProposalForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = e.target.querySelector('#treasury-proposal-title').value;
        const description = e.target.querySelector('#treasury-proposal-description').value;
        const amount = parseFloat(e.target.querySelector('#treasury-proposal-amount').value);
        const recipient = e.target.querySelector('#treasury-proposal-recipient').value;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        try {
            await createTreasuryProposal({ title, description, amount, recipient });
            treasuryProposalFormMessage.textContent = 'Success! Refreshing proposals...';
            await renderTreasuryProposals();
            setTimeout(() => {
                cancelTreasuryProposalBtn.click();
                treasuryFilterNav.querySelector('.filter-btn[data-status="active"]')?.click();
            }, 2000);
        } catch (error) {
            treasuryProposalFormMessage.textContent = `Error: ${error.message}`;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Proposal';
        }
    });

    // VOTE Event Delegation (for both tabs)
    document.getElementById('dao-section').addEventListener('click', async (e) => {
        if (!e.target.matches('.vote-btn')) return;
        
        const button = e.target;
        const vote = button.dataset.vote;
        const proposalItem = button.closest('.proposal-item');
        const proposalId = proposalItem.dataset.proposalId;
        const tabContent = button.closest('.dao-content-page');
        const isGeneralTab = tabContent.id === 'general-voting-content';

        const actionsContainer = proposalItem.querySelector('.vote-actions');
        const messageEl = proposalItem.querySelector('.vote-message');

        if(actionsContainer) actionsContainer.style.display = 'none';
        if(messageEl) messageEl.textContent = 'Submitting vote...';

        try {
            if (!auth.currentUser) throw new Error("You must be logged in to vote.");
            
            const statusBadge = proposalItem.querySelector('.proposal-status-badge');
            let status;
            if(statusBadge.textContent.includes('Round 1')) status = 'active_round1';
            else if (statusBadge.textContent.includes('Round 2')) status = 'active_round2';
            else throw new Error("Proposal is not in an active voting phase.");

            if (isGeneralTab) {
                const voteFunction = status === 'active_round1' ? voteOnProposal : voteOnProposalRound2;
                await voteFunction({ proposalId, vote });
                await renderGeneralProposals();
            } else { // Treasury Tab
                const voteFunction = status === 'active_round1' ? voteOnTreasuryProposalRound1 : voteOnTreasuryProposalRound2;
                await voteFunction({ proposalId, vote });
                await renderTreasuryProposals();
            }
            // The render function will automatically show the "You have voted" message.
        } catch (error) {
            console.error("Voting error:", error);
            if (messageEl) {
                messageEl.textContent = error.message;
                messageEl.className = 'vote-message error';
            }
            if (actionsContainer) actionsContainer.style.display = 'flex'; // Show buttons again on error
        }
    });

    // --- Initial State Setup ---
    if (daoNavButtons.length > 0) daoNavButtons[0].click();
}

// ===================================================================
// TREASURY PROPOSAL UI LOGIC
// ===================================================================

// --- DOM Element Selection for Treasury ---
const createTreasuryProposalBtn = document.getElementById('create-treasury-proposal-btn');
const treasuryProposalFormContainer = document.getElementById('treasury-proposal-form-container');
const treasuryProposalForm = document.getElementById('treasury-proposal-form');
const cancelTreasuryProposalBtn = document.getElementById('cancel-treasury-proposal-btn');
const treasuryProposalFormMessage = document.getElementById('treasury-proposal-form-message');

// --- Event Listener: Show Treasury Proposal Form ---
if (createTreasuryProposalBtn) {
    createTreasuryProposalBtn.addEventListener('click', async () => {
        setButtonLoading(createTreasuryProposalBtn, true);
        try {
            // Use the same eligibility check as the general proposals
            const checkDaoEligibility = firebase.functions().httpsCallable('checkDaoEligibility');
            const result = await checkDaoEligibility();

            if (result.data.eligible) {
                // Eligible: show the form
                treasuryProposalFormContainer.classList.remove('hidden');
                createTreasuryProposalBtn.classList.add('hidden');
            } else {
                // Not eligible: show an alert
                alert("Proposal creation is limited to top 100 supporters who have completed KYC and registered a wallet.");
            }
        } catch (error) {
            console.error("Error checking DAO eligibility for treasury:", error);
            alert(`An error occurred while checking your eligibility: ${error.message}`);
        } finally {
            setButtonLoading(createTreasuryProposalBtn, false);
        }
    });
}

// --- Event Listener: Cancel Treasury Proposal Form ---
if (cancelTreasuryProposalBtn) {
    cancelTreasuryProposalBtn.addEventListener('click', () => {
        treasuryProposalFormContainer.classList.add('hidden');
        createTreasuryProposalBtn.classList.remove('hidden');
        treasuryProposalForm.reset();
        treasuryProposalFormMessage.textContent = '';
        treasuryProposalFormMessage.className = 'message';
    });
}

// --- Event Listener: Submit Treasury Proposal Form ---
if (treasuryProposalForm) {
    treasuryProposalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = treasuryProposalForm.querySelector('button[type="submit"]');
        const title = document.getElementById('treasury-proposal-title').value.trim();
        const description = document.getElementById('treasury-proposal-description').value.trim();
        const amount = parseFloat(document.getElementById('treasury-proposal-amount').value);
        const recipient = document.getElementById('treasury-proposal-recipient').value.trim();

        // Validation
        if (!title || !description || isNaN(amount) || amount <= 0 || !recipient) {
            showFormMessage(treasuryProposalFormMessage, 'Please fill out all fields correctly.', 'error');
            return;
        }
        if (!recipient.match(/^G[A-Z0-9]{55}$/)) {
            showFormMessage(treasuryProposalFormMessage, 'Invalid recipient Stellar wallet address format.', 'error');
            return;
        }

        setButtonLoading(submitButton, true);
        showFormMessage(treasuryProposalFormMessage, 'Submitting proposal...', 'info');

        try {
            const createTreasuryProposal = firebase.functions().httpsCallable('createTreasuryProposal');
            const result = await createTreasuryProposal({ title, description, amount, recipient });

            if (result.data.status === 'success') {
                showFormMessage(treasuryProposalFormMessage, 'Proposal submitted successfully! Refreshing...', 'success');
                setTimeout(() => {
                    // Hide form, show create button, and reload proposals
                    treasuryProposalFormContainer.classList.add('hidden');
                    createTreasuryProposalBtn.classList.remove('hidden');
                    treasuryProposalForm.reset();
                    // Assumes a function to load treasury proposals exists for auto-refresh
                    if (window.loadTreasuryProposals) {
                        window.loadTreasuryProposals();
                    }
                }, 2000);
            } else {
                throw new Error(result.data.message || 'An unknown error occurred.');
            }
        } catch (error) {
            console.error("Error creating treasury proposal:", error);
            showFormMessage(treasuryProposalFormMessage, `Error: ${error.message}`, 'error');
        } finally {
            setButtonLoading(submitButton, false);
        }
    });
}



/**
 * Handles the click event for the "Create Post" button.
 * Checks user eligibility before showing the form.
 */
function handleCreatePostClick() {
    if (userProfile.kycStatus === 'verified' && userProfile.phxWalletAddress) {
        dom.communityPostFormContainer.classList.remove('hidden');
        dom.createCommunityPostBtn.classList.add('hidden');
    } else {
        showToastMessage("Post creation requires KYC verification and a registered Stellar wallet.", "error");
    }
}

/**
 * Hides the post creation form and shows the "Create Post" button.
 */
function hidePostForm() {
    dom.communityPostFormContainer.classList.add('hidden');
    dom.createCommunityPostBtn.classList.remove('hidden');
    dom.communityPostForm.reset();
    dom.communityPostFormMessage.textContent = '';
}

/**
 * Handles the submission of a new community post.
 * @param {Event} e The form submission event.
 */
async function handlePostSubmit(e) {
    e.preventDefault();
    const title = dom.communityPostTitle.value.trim();
    const content = dom.communityPostContent.value.trim();

    if (!title || !content) {
        showFormMessage(dom.communityPostFormMessage, "Title and content are required.", "error");
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        showFormMessage(dom.communityPostFormMessage, "You must be logged in to post.", "error");
        return;
    }

    const postButton = dom.communityPostForm.querySelector('button[type="submit"]');
    postButton.disabled = true;
    showFormMessage(dom.communityPostFormMessage, "Submitting your post...", "info");

    try {
        const postsCollection = collection(db, "communityPosts");
        await addDoc(postsCollection, {
            title: title,
            content: content,
            authorUid: user.uid,
            authorName: userProfile.displayName || user.email, // Use displayName if available
            createdAt: serverTimestamp()
        });

        hidePostForm();
        showToastMessage("Your post has been published!", "success");

    } catch (error) {
        console.error("Error creating community post: ", error);
        showFormMessage(dom.communityPostFormMessage, "An error occurred. Please try again.", "error");
    } finally {
        postButton.disabled = false;
    }
}

/**
 * Fetches and renders community posts from Firestore in real-time.
 */
function listenForCommunityPosts() {
    if (communityPostsUnsubscribe) {
        communityPostsUnsubscribe(); // Detach previous listener
    }

    const postsCollection = collection(db, "communityPosts");
    const q = query(postsCollection, orderBy("createdAt", "desc"));

    communityPostsUnsubscribe = onSnapshot(q, (querySnapshot) => {
        dom.communityPostsListContainer.innerHTML = ''; // Clear the list

        if (querySnapshot.empty) {
            dom.communityPostsListContainer.innerHTML = '<p>No posts yet. Be the first to start a conversation!</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const post = doc.data();
            const postElement = createCommunityPostElement(post, doc.id);
            dom.communityPostsListContainer.appendChild(postElement);
        });

    }, (error) => {
        console.error("Error fetching community posts: ", error);
        dom.communityPostsListContainer.innerHTML = '<p class="error-message">Could not load posts. Please try again later.</p>';
    });
}

/**
 * Creates an HTML element for a single community post.
 * @param {object} post The post data from Firestore.
 * @param {string} id The document ID of the post.
 * @returns {HTMLElement} The created div element for the post.
 */
function createCommunityPostElement(post, id) {
    const postItem = document.createElement('div');
    postItem.className = 'community-post-item';
    postItem.dataset.id = id;

    const creationDate = post.createdAt ? post.createdAt.toDate().toLocaleString() : 'Just now';

    postItem.innerHTML = `
        <div class="post-header">
            <h5 class="post-title">${escapeHTML(post.title)}</h5>
            <div class="post-meta">
                by <span class="post-author">${escapeHTML(post.authorName)}</span>
            </div>
        </div>
        <p class="post-content">${escapeHTML(post.content)}</p>
        <div class="post-footer">
            <span>${creationDate}</span>
        </div>
    `;
    return postItem;
}

// We need to call the new initialization functions.
// Find the `initApp` function and add the new initializers.

// Helper function to escape HTML to prevent XSS attacks
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, function(match) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[match];
    });
}
