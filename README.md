# 馃 neural-memory 鈥?绫讳汉绁炵粡璁板繂绯荤粺

> 鍩轰簬绁炵粡鍏冩ā鍨嬬殑 AI Agent 鎸佺画瀛︿範璁板繂鏋舵瀯  
> 闆跺閮ㄤ緷璧?路 绾?Node.js 鏍囧噯搴?路 42KB

---

## 姒傝堪

灏嗘瘡鏉¤蹇嗘娊璞′负鐙珛銆岀缁忓厓銆嶏紝閫氳繃鍔犳潈鏈夊悜銆岀獊瑙︺€嶅缓绔嬪叧鑱旓紝浣跨敤鍓嶅悜淇″彿浼犳挱锛圔FS锛夈€佽但甯冨涔狅紙Hebbian锛夊拰鍛ㄦ湡鎬ц蹇嗗珐鍥猴紝瀹炵幇鍙寔缁殑鑷富瀛︿範涓庨仐蹇樸€?
## 蹇€熷畨瑁?
```bash
# 閫氳繃 OpenClaw CLI 瀹夎锛堟帹鑽愶級
openclaw skills install neural-memory

# 鎴栦粠 GitHub 鎵嬪姩瀹夎
git clone https://github.com/Hight0xff/synaptic.git
cd synaptic
npm install  # 闆朵緷璧栵紝浠呭缓绔嬭蒋閾炬帴
```

瀹夎鍚庤繍琛屽垵濮嬪寲锛?```bash
node seed-self.js   # 鍒涘缓鑷紩鐢ㄧ瀛愮缁忓厓
node cli.js stats   # 楠岃瘉瀹夎
```

## 鏋舵瀯

```
neural-memory/
鈹溾攢鈹€ lib/                        # 鏍稿績寮曟搸
鈹?  鈹溾攢鈹€ neuron-store.js         # 绁炵粡鍏冨瓨鍌紙鏂囦欢绯荤粺锛?鈹?  鈹溾攢鈹€ synapse-matrix.js       # 绐佽Е鐭╅樀锛堝姞鏉冩湁鍚戝浘锛?鈹?  鈹溾攢鈹€ activation-engine.js    # 鍓嶅悜淇″彿浼犳挱锛圔FS锛?鈹?  鈹溾攢鈹€ hebbian.js              # 璧竷瀛︿範锛堝叡婵€娲诲己鍖栵級
鈹?  鈹溾攢鈹€ consolidator.js         # 鐫＄湢宸╁浐锛堣“鍑?褰掓。/妯″紡鍙戠幇锛?鈹?  鈹溾攢鈹€ recall.js               # 缁熶竴鍙洖鎺ュ彛
鈹?  鈹斺攢鈹€ migrator.js             # 杩佺Щ宸ュ叿锛堜粠 MEMORY.md 瀵煎叆锛?鈹溾攢鈹€ cli.js                      # 鍛戒护琛岀鐞嗗伐鍏?鈹溾攢鈹€ recall.js                   # 蹇€熷彫鍥炲叆鍙?鈹溾攢鈹€ server.js                   # HTTP API 鏈嶅姟锛堢鍙?3547锛?鈹溾攢鈹€ seed-self.js                # 鑷紩鐢ㄧ瀛愬垵濮嬪寲
鈹溾攢鈹€ install.js                  # 瀹夎鑴氭湰
鈹斺攢鈹€ vis.html                    # D3 鍙鍖栭潰鏉?```

## CLI 浣跨敤

```bash
# 鎼滅储/婵€娲昏蹇?node cli.js search "浣犵殑鏌ヨ"

# 璁板綍鏂拌蹇?node cli.js record sensory "瀛︿範浜嗘柊鐭ヨ瘑" --content "璇︾粏鍐呭" --tags "tag1,tag2"

# 鍒涘缓绁炵粡鍏?node cli.js create fact "浜嬪疄鍚嶇О" --content "浜嬪疄鍐呭"

# 鏌ョ湅绯荤粺缁熻
node cli.js stats

# 杩愯璁板繂宸╁浐锛堣“鍑?褰掓。锛?node cli.js consolidate

# 鍒楀嚭璁板繂
node cli.js list [type]
```

## HTTP API 鏈嶅姟

```bash
node server.js --port 3547 --auth-key your-secret-key
```

| 绔偣 | 鏂规硶 | 璇存槑 |
|------|------|------|
| `/api/recall?q=...` | GET | 鍙洖鎼滅储 |
| `/api/neuron/:id` | GET | 鑾峰彇绁炵粡鍏冭鎯?|
| `/api/neurons` | GET | 鍒楀嚭鎵€鏈夌缁忓厓 |
| `/api/create` | POST | 鍒涘缓绁炵粡鍏?|
| `/api/stats` | GET | 绯荤粺缁熻 |
| `/api/consolidate` | POST | 瑙﹀彂宸╁浐 |
| `/` | GET | 鍙鍖栭潰鏉?|

## MCP 鍗忚鏀寔

鏈郴缁熷悓鏃舵彁渚?[MCP (Model Context Protocol)](https://modelcontextprotocol.io) 鏈嶅姟鍣紝浣夸换浣曞吋瀹?MCP 鐨?AI 瀹㈡埛绔紙Claude Desktop銆丆ursor銆乂S Code AI 绛夛級閮借兘鐩存帴鎺ュ叆绁炵粡璁板繂銆?
```bash
# 鍚姩 MCP 鏈嶅姟鍣?cd mcp && node index.js

# 鎴栧湪 Claude Desktop 涓厤缃細
# {
#   "mcpServers": {
#     "neural-memory": {
#       "command": "node",
#       "args": ["path/to/mcp/index.js"]
#     }
#   }
# }
```

MCP 鎻愪緵浠ヤ笅宸ュ叿锛?- `search_memory` 鈥?鎼滅储婵€娲昏蹇?- `record_memory` 鈥?璁板綍鏂拌蹇?- `get_neuron` 鈥?鑾峰彇绁炵粡鍏冭鎯?- `get_stats` 鈥?绯荤粺缁熻
- `consolidate` 鈥?瑙﹀彂宸╁浐
- *璁″垝涓?锛歚list_recent`銆乣delete_neuron`銆乣connect_neurons`

---

## 绁炵粡绉戝鏄犲皠

| 鐢熺墿缁撴瀯 | 浠ｇ爜瑙掕壊 | 瀹炵幇 |
|---------|---------|------|
| 鏍戠獊锛堟帴鏀朵俊鍙凤級 | `activation-engine.computeSignal()` | 鍏抽敭璇嶅尮閰?+ 澶氱淮搴﹁瘎鍒?|
| 鑳炰綋锛堟暣鍚堝垽鏂級 | `if potential >= threshold` | 绱Н淇″彿涓庨槇鍊兼瘮杈?|
| 杞寸獊锛堣緭鍑轰俊鍙凤級 | `neuron.output = 1.0` | 鏍囪婵€娲诲苟浼犳挱 |
| 绐佽Е锛堣繛鎺ュ己搴︼級 | `synapse-matrix.getWeight()` | 0~1 鍔犳潈鏈夊悜杈?|
| 璧竷瀛︿範 | `hebbian.learn()` | 鍏辨縺娲诲己鍖栬繛鎺?|
| 鐫＄湢宸╁浐 | `consolidator.consolidate()` | 琛板噺/褰掓。/妯″紡鍙戠幇 |

---

## 馃敀 鏁忔劅淇℃伅瀹夊叏鎻愮ず

> **閮ㄧ讲鍓嶅繀璇?*锛氭湰绯荤粺鍦ㄨ繍琛屼腑浼氱敓鎴愮湡瀹炵殑瀵硅瘽/鍐崇瓥鏁版嵁銆?
### 鈿狅笍 鍒囧嬁鎻愪氦鍒板叕寮€浠撳簱鐨勫唴瀹?
1. **宸ヤ綔鍖烘暟鎹?*锛歚memory/neural/neurons/` 鍜?`memory/neural/archive/` 涓嬬殑 JSON 鏂囦欢鍖呭惈瀹為檯瀵硅瘽璁板綍鍜屼釜浜鸿蹇?2. **绐佽Е鏁版嵁**锛歚memory/neural/synapses.json` 鍖呭惈鍏宠仈鏉冮噸鍥?3. **鐜鍙橀噺/瀵嗛挜**锛氫换浣?`.env` 鏂囦欢銆丄PI Key 鍜屽瘑鐮?4. **閰嶇疆鏂囦欢**锛歚config.json` 鍙兘鍖呭惈鍐呯綉璺緞鍜屾湇鍔￠厤缃?
### 瀹夊叏浣跨敤寤鸿

- 杩愯 `git add` 鍓嶆鏌?`.gitignore` 鏄惁姝ｇ‘閰嶇疆
- 浣跨敤 `--auth-key` 鍙傛暟淇濇姢 HTTP API 绔偣
- 瀹氭湡娓呯悊杩囨湡鐨勫瓨妗ｆ暟鎹?- 鍦ㄥ叕鍏辨紨绀轰腑浣跨敤 `seed-self.js` 鐢熸垚鐨勭ず渚嬫暟鎹紝鑰岄潪鐪熷疄鏁版嵁

---

## License

MIT 鈥?鑷敱浣跨敤銆佷慨鏀广€佸垎鍙戙€傛杩?Star 猸愩€両ssue 馃挰銆丳R 馃銆?
