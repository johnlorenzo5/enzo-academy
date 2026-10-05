import Fastify from 'fastify';
import { academy, ApiError, type Store, type Identity } from './academy.js';

export function buildFirebaseApp({store,verify,logger=false,adminUid=process.env.FIREBASE_ADMIN_UID??'Ig0jPHHV9vSm887gPZNcuxFnzQH2',clock=Date.now}:{store:Store;verify:(token:string)=>Promise<Identity>;logger?:boolean;adminUid?:string;clock?:()=>number}){
  const app=Fastify({logger,bodyLimit:700000});
  const service=academy(store,clock);
  const identities=new WeakMap<object,Identity>();
  app.setErrorHandler((error,request,reply)=>{
    if(error instanceof ApiError)return reply.code(error.statusCode).send({error:error.message});
    const statusCode=(error as {statusCode?:number})?.statusCode;
    if(statusCode&&statusCode<500)return reply.code(statusCode).send({error:'Invalid request.'});
    request.log.error({err:error},'Firebase request failed');
    return reply.code(503).send({error:'The data service is unavailable. Check the API Firebase credentials and Firestore setup.'});
  });
  app.addHook('preHandler',async(request,reply)=>{
    if(request.method==='GET'&&['/api/health','/api/courses'].includes(request.url.split('?')[0]))return;
    const header=request.headers.authorization;
    if(!header?.startsWith('Bearer '))return reply.code(401).send({error:'Please log in.'});
    let user:Identity;
    try{user=await verify(header.slice(7));}catch(error){if(error instanceof ApiError)throw error;return reply.code(401).send({error:'Your session could not be verified. Log in again.'});}
    identities.set(request,user);
    if(request.url.startsWith('/api/admin/')&&user.uid!==adminUid)return reply.code(403).send({error:'Administrator access is required.'});
  });
  app.get('/api/health',async()=>({status:'ok',mode:'firebase',projectId:process.env.FIREBASE_PROJECT_ID??'ap-6-95cb9'}));
  app.get('/api/courses',async()=>({courses:await service.courses()}));
  app.get('/api/me',async request=>{const user=identities.get(request)!;return {account:await service.me(user,user.uid===adminUid)};});
  app.get('/api/enrollments',async request=>({enrollments:await service.enrollments(identities.get(request)!.uid)}));
  app.post<{Params:{id:string}}>('/api/courses/:id/enroll',async request=>({enrollment:await service.enroll(identities.get(request)!,request.params.id)}));
  app.post<{Params:{id:string;moduleId:string}}>('/api/enrollments/:id/modules/:moduleId/submit',async request=>({enrollment:await service.submit(identities.get(request)!.uid,request.params.id,request.params.moduleId,request.body)}));
  app.get('/api/admin/courses',async()=>({courses:await service.courses(true)}));
  app.post('/api/admin/courses',async(request,reply)=>reply.code(201).send({course:await service.saveCourse(request.body)}));
  app.put<{Params:{id:string}}>('/api/admin/courses/:id',async request=>({course:await service.saveCourse(request.body,request.params.id)}));
  app.delete<{Params:{id:string}}>('/api/admin/courses/:id',async request=>service.archiveCourse(request.params.id));
  app.get('/api/admin/enrollments',async()=>({enrollments:await service.enrollments()}));
  app.get('/api/admin/learners',async()=>({learners:await service.learners()}));
  app.post<{Params:{uid:string;id:string}}>('/api/admin/enrollments/:uid/:id/cancel',async request=>service.cancel(request.params.uid,request.params.id));
  return app;
}
