
document.addEventListener("DOMContentLoaded", function() {
    const auth = firebase.auth();
    const functions = firebase.functions();
    const db = firebase.firestore();

    const kycRequestsList = document.getElementById("kyc-requests-list");
    const loadRequestsButton = document.getElementById("load-requests-btn");

    // Check for admin status
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const idTokenResult = await user.getIdTokenResult();
            // Show admin content if the user is an admin
            if (idTokenResult.claims.admin) {
                document.getElementById("admin-content").style.display = "block";
                loadKycRequests();
            } else {
                alert("You are not authorized to view this page.");
                window.location.href = '/';
            }
        } else {
            // If no user is signed in, redirect to login
            window.location.href = '/';
        }
    });

    // Function to load KYC requests
    const loadKycRequests = () => {
        const getKycRequests = functions.httpsCallable('getKycRequests');
        getKycRequests().then(result => {
            const requests = result.data.requests;
            kycRequestsList.innerHTML = ""; // Clear current list
            if (requests && requests.length > 0) {
                requests.forEach(request => {
                    const listItem = document.createElement("li");
                    listItem.innerHTML = `
                        User ID: ${request.uid} - Wallet: ${request.walletAddress}
                        <button class="approve" data-uid="${request.uid}" data-request-id="${request.id}">Approve</button>
                        <button class="reject" data-uid="${request.uid}" data-request-id="${request.id}">Reject</button>
                    `;
                    kycRequestsList.appendChild(listItem);
                });
            } else {
                kycRequestsList.innerHTML = "<li>No pending KYC requests.</li>";
            }
        }).catch(error => {
            console.error("Error fetching KYC requests: ", error);
            kycRequestsList.innerHTML = "<li>Error loading requests.</li>";
        });
    };

    // Event listener for approve/reject buttons
    kycRequestsList.addEventListener("click", function(e) {
        const action = e.target.className; // 'approve' or 'reject'
        const userId = e.target.getAttribute("data-uid");
        const requestId = e.target.getAttribute("data-request-id");

        if (action === "approve" || action === "reject") {
            if (!userId || !requestId) {
                alert("Could not process request. UID or Request ID is missing.");
                return;
            }
            
            const manageKycRequest = functions.httpsCallable('manageKycRequest');
            manageKycRequest({ userId, requestId, action })
                .then(result => {
                    alert(result.data.message);
                    loadKycRequests(); // Refresh the list
                })
                .catch(error => {
                    alert("Error: " + error.message);
                    console.error("Error managing KYC request: ", error);
                });
        }
    });

    // Event listener for the load button
    if(loadRequestsButton) {
        loadRequestsButton.addEventListener("click", loadKycRequests);
    }
});
