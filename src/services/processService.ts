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
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db, OperationType, handleFirestoreError } from '@/src/firebase';
import { TravelProcess, ProcessDocument } from '@/src/types';

const PROCESSES_COLLECTION = 'processes';

export function subscribeToProcesses(clientUid: string, callback: (processes: TravelProcess[]) => void) {
  const q = query(collection(db, PROCESSES_COLLECTION), where('clientUid', '==', clientUid));
  
  return onSnapshot(q, (snapshot) => {
    const processes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TravelProcess));
    callback(processes);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, PROCESSES_COLLECTION);
  });
}

export function subscribeToAllProcesses(callback: (processes: TravelProcess[]) => void) {
  return onSnapshot(collection(db, PROCESSES_COLLECTION), (snapshot) => {
    const processes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TravelProcess));
    callback(processes);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, PROCESSES_COLLECTION);
  });
}

export async function createProcess(process: Omit<TravelProcess, 'id' | 'createdAt' | 'updatedAt'>) {
  try {
    const docRef = await addDoc(collection(db, PROCESSES_COLLECTION), {
      ...process,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, PROCESSES_COLLECTION);
  }
}

export async function updateProcessStatus(processId: string, status: TravelProcess['status'], progress: number) {
  const docRef = doc(db, PROCESSES_COLLECTION, processId);
  try {
    await updateDoc(docRef, {
      status,
      progress,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROCESSES_COLLECTION}/${processId}`);
  }
}

export function subscribeToDocuments(processId: string, callback: (docs: ProcessDocument[]) => void) {
  const docsRef = collection(db, PROCESSES_COLLECTION, processId, 'documents');
  
  return onSnapshot(docsRef, (snapshot) => {
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessDocument));
    callback(docs);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `${PROCESSES_COLLECTION}/${processId}/documents`);
  });
}
