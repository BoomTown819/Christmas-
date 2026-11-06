# Captures emails the Auth server sends (password resets) into ./mail/*.eml
import os, time, asyncio
from aiosmtpd.controller import Controller
os.makedirs("mail", exist_ok=True)
class H:
    async def handle_DATA(self, server, session, envelope):
        name = f"mail/{int(time.time()*1000)}-{envelope.rcpt_tos[0]}.eml"
        open(name, "wb").write(envelope.content)
        return "250 OK"
c = Controller(H(), hostname="127.0.0.1", port=2500); c.start()
print("mail sink on 2500", flush=True)
asyncio.get_event_loop().run_forever()
