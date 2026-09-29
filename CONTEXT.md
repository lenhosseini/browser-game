# Browser Game

A third-person, open-world multiplayer action roguelite played in the browser: a "mini World of Warcraft" where death is permanent.

## Language

### World and people

**World**:
The single persistent, shared open world that all online Characters inhabit together.
_Avoid_: Server, shard, realm, map, instance

**Player**:
An anonymous participant, recognised by the browser they play from; there are no accounts. A cleared or different browser is a new Player.
_Avoid_: User, account, IP

**Character**:
A Player's avatar in the World. Dies permanently: once dead, it can never be played again. Nothing carries over from a dead Character.
_Avoid_: Hero, toon, avatar

**Permadeath**:
The rule that a Character's death is final; the Player must create a new Character to keep playing.
_Avoid_: Hardcore mode, run end

**Logout**:
A living Character leaving the World. It is kept, and resumes where it left off when its Player returns.
_Avoid_: Disconnect (a network event that may lead to a Logout, not the Logout itself)

### Combat

**Tab-target**:
Combat where abilities are aimed at a selected target rather than at a point in space; hits are resolved against the target, not by aim.
_Avoid_: Lock-on, auto-aim

**Telegraph**:
A visible marker on the ground warning where an effect will land; anything standing inside it when it resolves is hit.
_Avoid_: AoE indicator, danger zone

**Dodge**:
A short, committed movement that grants brief immunity to hits.
_Avoid_: Roll, dash, evade
