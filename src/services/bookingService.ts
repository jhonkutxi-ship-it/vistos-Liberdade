/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { TransferBooking } from '@/src/types';

const BOOKINGS_COLLECTION = 'bookings';

export function subscribeToBookings(clientUid: string, callback: (bookings: TransferBooking[]) => void) {
  const q = query(collection(db, BOOKINGS_COLLECTION), where('clientUid', '==', clientUid));
  
  return onSnapshot(q, (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransferBooking));
    callback(bookings);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, BOOKINGS_COLLECTION);
  });
}

export function subscribeToAllBookings(callback: (bookings: TransferBooking[]) => void) {
  return onSnapshot(collection(db, BOOKINGS_COLLECTION), (snapshot) => {
    const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TransferBooking));
    callback(bookings);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, BOOKINGS_COLLECTION);
  });
}

export async function createBooking(booking: Omit<TransferBooking, 'id' | 'status'>) {
  try {
    const docRef = await addDoc(collection(db, BOOKINGS_COLLECTION), {
      ...booking,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, BOOKINGS_COLLECTION);
  }
}

export async function updateBookingStatus(bookingId: string, status: TransferBooking['status']) {
  const docRef = doc(db, BOOKINGS_COLLECTION, bookingId);
  try {
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${BOOKINGS_COLLECTION}/${bookingId}`);
  }
}
