"""Bound uploads before Starlette parses and spools multipart content."""
from starlette.responses import JSONResponse
from fastapi import HTTPException

class BodyTooLarge(HTTPException):
    def __init__(self):
        super().__init__(413,'Maximal 2 GiB pro Video')

class UploadLimit:
    def __init__(self,app,max_bytes=2*1024**3+2*1024**2):
        self.app=app
        self.max_bytes=max_bytes

    async def __call__(self,scope,receive,send):
        if scope['type']!='http' or scope['method'] not in ('POST','PUT','PATCH'):
            return await self.app(scope,receive,send)
        headers=dict(scope.get('headers',[]))
        length=headers.get(b'content-length')
        try:
            declared=int(length) if length is not None else None
        except ValueError:
            return await JSONResponse({'detail':'Ungültige Inhaltslänge'},status_code=400)(scope,receive,send)
        if declared is not None and declared<0:
            return await JSONResponse({'detail':'Ungültige Inhaltslänge'},status_code=400)(scope,receive,send)
        if declared is not None and declared>self.max_bytes:
            return await self.reject(scope,receive,send)
        total=0
        started=False
        overridden=False
        async def bounded_receive():
            nonlocal total
            message=await receive()
            if message['type']=='http.request':
                total+=len(message.get('body',b''))
                if total>self.max_bytes:
                    raise BodyTooLarge()
            return message
        async def tracked_send(message):
            nonlocal started,overridden
            if message['type']=='http.response.start':
                started=True
                if total>self.max_bytes:
                    overridden=True
                    await self.reject(scope,receive,send)
                    return
            if not overridden:
                await send(message)
        try:
            await self.app(scope,bounded_receive,tracked_send)
        except BodyTooLarge:
            if not started:
                await self.reject(scope,receive,send)

    async def reject(self,scope,receive,send):
        return await JSONResponse({'detail':'Maximal 2 GiB pro Video'},status_code=413)(scope,receive,send)
