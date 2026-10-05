import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ApiError, type Store, type Identity } from './academy.js';

export function firebaseBackend(){
  const projectId=process.env.FIREBASE_PROJECT_ID??'ap-6-95cb9';
  const app=getApps()[0]??initializeApp({projectId,credential:applicationDefault()});
  const db=getFirestore(app);
  // Resolve credentials before invoking Firestore so a missing local credential
  // becomes a controlled API error instead of a background gRPC rejection.
  let initialization:Promise<unknown>|undefined;
  function ready(){
    initialization??=app.options.credential!.getAccessToken().catch(()=>{
      initialization=undefined;
      throw new ApiError(503,'Firebase server credentials are not ready. Configure the API credential file and restart it.');
    });
    return initialization;
  }
  const store:Store={
    async get<T>(collection:string,id:string){await ready();const doc=await db.collection(collection).doc(id).get();return doc.exists?doc.data() as T:null;},
    async list<T>(collection:string,filter?:{field:string;value:string}){await ready();const ref=db.collection(collection);const result=await (filter?ref.where(filter.field,'==',filter.value):ref).get();return result.docs.map(doc=>doc.data() as T);},
    async transaction(work){await ready();return db.runTransaction(async transaction=>work({
      async get<T>(collection:string,id:string){const doc=await transaction.get(db.collection(collection).doc(id));return doc.exists?doc.data() as T:null;},
      set(collection,id,value){transaction.set(db.collection(collection).doc(id),value as Record<string,unknown>);},
    }));},
  };
  async function verify(token:string):Promise<Identity>{
    try { await ready();const decoded=await getAuth(app).verifyIdToken(token,true);return {uid:decoded.uid,email:decoded.email,name:decoded.name}; }
    catch(error) { const code=(error as {code?:string}).code; if(code?.startsWith('auth/')&&code!=='auth/insufficient-permission')throw new ApiError(401,'Your session could not be verified. Log in again.');throw new ApiError(503,'Firebase server credentials are not ready. Configure the API credential file and restart it.'); }
  }
  return {store,verify};
}
