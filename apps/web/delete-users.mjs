import admin from 'firebase-admin';
import serviceAccount from './service-account.json' with { type: 'json' };

// ⚠️ This user UID will be skipped and preserved
const USER_UID_TO_KEEP = '1uxiLsZYSbbPjWjtyJJHLnuUbBJf';

// Initialize the Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function deleteAllUsersExceptOne() {
  let nextPageToken;
  let totalDeleted = 0;

  try {
    do {
      // 1. Fetch users in batches of 1000
      const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
      
      // 2. Filter out the specific user UID you want to preserve
      const uidsToDelete = listUsersResult.users
        .map((user) => user.uid)
        .filter((uid) => uid !== USER_UID_TO_KEEP);

      if (uidsToDelete.length > 0) {
        // 3. Delete the rest of the batch
        const deleteResult = await admin.auth().deleteUsers(uidsToDelete);
        totalDeleted += deleteResult.successCount;
        
        console.log(`Successfully deleted ${deleteResult.successCount} users.`);
        if (deleteResult.failureCount > 0) {
          console.error(`Failed to delete ${deleteResult.failureCount} users.`);
        }
      }

      // Progress to the next page if there are more users
      nextPageToken = listUsersResult.pageToken;
    } while (nextPageToken);

    console.log(`All operations finished. Total users removed: ${totalDeleted}`);
  } catch (error) {
    console.error('Error listing or deleting users:', error);
  }
}

deleteAllUsersExceptOne();
