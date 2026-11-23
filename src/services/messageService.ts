/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  orderBy,
  limit,
  updateDoc,
  doc
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { InternalMessage } from '@/src/types';

const MESSAGES_COLLECTION = 'messages';

export function subscribeToMessages(uid: string, otherUid: string, callback: (messages: InternalMessage[]) => void) {
  // Firestore doesn't support OR queries easily for chat, so we filter in memory or use two queries
  // For simplicity in this foundation, we'll fetch messages where the user is either sender or receiver
  const q = query(
    collection(db, MESSAGES_COLLECTION),
    orderBy('timestamp', 'asc'),
    limit(100)
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as InternalMessage))
      .filter(m => (m.senderUid === uid && m.receiverUid === otherUid) || (m.senderUid === otherUid && m.receiverUid === uid));
    callback(messages);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, MESSAGES_COLLECTION);
  });
}

export async function sendMessage(senderUid: string, receiverUid: string, content: string) {
  try {
    const docRef = await addDoc(collection(db, MESSAGES_COLLECTION), {
      senderUid,
      receiverUid,
      content,
      timestamp: serverTimestamp(),
      read: false,
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, MESSAGES_COLLECTION);
  }
}

export async function markAsRead(messageId: string) {
  const docRef = doc(db, MESSAGES_COLLECTION, messageId);
  try {
    await updateDoc(docRef, {
      read: true,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${MESSAGES_COLLECTION}/${messageId}`);
  }
}
