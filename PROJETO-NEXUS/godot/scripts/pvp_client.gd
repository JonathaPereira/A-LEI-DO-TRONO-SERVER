extends Node
## Server owns all combat results. Reconnection credentials never enter match logs.
signal received(packet: Dictionary)
signal connection_changed
signal failed(message: String)
var BUILD: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://data/pvp-build.json"))
const STORE := "user://pvp-connection.cfg"
const DEFAULT_ENDPOINT := "wss://nexus-pvp.onrender.com/pvp"
const RETIRED_ENDPOINT := "wss://nexus-mn.onrender.com/pvp"
var endpoint := DEFAULT_ENDPOINT
var nickname := "Jogador"
var room: Dictionary = {}
var session: Dictionary = {}
var socket: WebSocketPeer
var connected := false
var pending_action := false
var intent: Dictionary = {}
var reconnect_at := 0
var connect_deadline := 0
var reconnect_until := 0
var manual := true
var ready_handshake := false
var last_state := WebSocketPeer.STATE_CLOSED
var turn_until := 0
func _ready() -> void:
	var config := ConfigFile.new()
	if config.load(STORE)==OK:
		endpoint=str(config.get_value("server","url",endpoint))
		nickname=str(config.get_value("server","nickname",nickname))
		var code: String=str(config.get_value("session","code",""))
		var token: String=str(config.get_value("session","token",""))
		if code!="" and token!="": session={"code":code,"token":token,"seat":int(config.get_value("session","seat",0))}
	# Migrate the retired deployment without overwriting custom/local test servers.
	if endpoint == RETIRED_ENDPOINT:
		endpoint = DEFAULT_ENDPOINT
		session = {}
		_save()
	if OS.has_feature("web"):
		var custom: Variant=JavaScriptBridge.eval("new URLSearchParams(window.location.search).get('pvp_server') || window.NEXUS_PVP_SERVER || null",true)
		if custom is String and (custom.begins_with("wss://") or custom.begins_with("ws://localhost:") or custom.begins_with("ws://127.0.0.1:")):
			if custom == RETIRED_ENDPOINT: custom = DEFAULT_ENDPOINT
			if endpoint!=custom:session={}
			endpoint=custom
			_save()
func _save() -> void:
	var config := ConfigFile.new()
	config.set_value("server","url",endpoint)
	config.set_value("server","nickname",nickname)
	for key in session: config.set_value("session",key,session[key])
	config.save(STORE)
func start(url: String, name_value: String, request: Dictionary) -> void:
	if not (url.begins_with("ws://") or url.begins_with("wss://")):
		failed.emit("Use o endereço ws:// ou wss:// do servidor PvP.")
		return
	if connected or (socket!=null and socket.get_ready_state()!=WebSocketPeer.STATE_CLOSED):
		failed.emit("Saia da sala atual antes de trocar de conexão.")
		return
	if request.get("type")=="resume" and url.strip_edges()!=endpoint:
		failed.emit("A sessão salva pertence a outro servidor. Crie ou entre em uma sala.")
		return
	endpoint=url.strip_edges()
	nickname=name_value.strip_edges().left(24)
	intent=request.duplicate(true)
	if intent.get("type")!="resume": session={}
	intent.name=nickname
	manual=false
	reconnect_until=Time.get_ticks_msec()+60000
	_open()
	_save()
func _open() -> void:
	socket=WebSocketPeer.new()
	socket.inbound_buffer_size=2*1024*1024
	socket.outbound_buffer_size=32768
	socket.max_queued_packets=64
	ready_handshake=false
	last_state=WebSocketPeer.STATE_CONNECTING
	connect_deadline=Time.get_ticks_msec()+10000
	var error := socket.connect_to_url(endpoint)
	if error!=OK:
		failed.emit("Não foi possível conectar ao servidor PvP.")
		reconnect_at=Time.get_ticks_msec()+3000
func _process(_delta: float) -> void:
	if socket==null: return
	socket.poll()
	var current := socket.get_ready_state()
	if current==WebSocketPeer.STATE_OPEN:
		while socket!=null and socket.get_available_packet_count()>0:
			var packet: Variant=JSON.parse_string(socket.get_packet().get_string_from_utf8())
			if packet is Dictionary: _receive(packet)
	elif current==WebSocketPeer.STATE_CONNECTING and Time.get_ticks_msec()>connect_deadline:
		socket.close()
	elif current==WebSocketPeer.STATE_CLOSED:
		if last_state!=WebSocketPeer.STATE_CLOSED:
			var was_connected := connected
			connected=false
			pending_action=false
			connection_changed.emit()
			if not manual:
				if was_connected:reconnect_until=Time.get_ticks_msec()+60000
				failed.emit("Conexão interrompida. Tentando reconectar…")
				reconnect_at=Time.get_ticks_msec()+2000
		if not manual and Time.get_ticks_msec()>=reconnect_at:
			if Time.get_ticks_msec()<reconnect_until:
				if not session.is_empty(): intent={"type":"resume","code":session.code,"token":session.token}
				_open()
				return
			manual=true
			failed.emit("Reconexão encerrada. Retome a sessão ou entre em outra sala.")
	last_state=current
func _receive(packet: Dictionary) -> void:
	if packet.get("type")=="hello":
		if packet.get("protocol")!=1 or packet.get("build")!=BUILD.build:
			manual=true
			failed.emit("Versão diferente do servidor. Atualize o jogo.")
			socket.close()
			return
		connected=true
		ready_handshake=true
		connection_changed.emit()
		send(intent)
		return
	if packet.get("type")=="session":
		session={"code":packet.code,"token":packet.token,"seat":int(packet.seat)}
		reconnect_until=Time.get_ticks_msec()+60000
		_save()
	if packet.get("type") in ["room","turn"]:
		room=packet
		turn_until=Time.get_ticks_msec()+maxi(0,int(packet.get("deadline",0))-int(packet.get("serverTime",0)))
		reconnect_until=Time.get_ticks_msec()+60000
		if packet.get("type")=="turn": pending_action=false
	if packet.get("type")=="error":
		pending_action=false
		failed.emit(str(packet.message))
		if intent.get("type") in ["create","join","resume"]:
			disconnect_server()
	if packet.get("type")=="left": disconnect_server()
	received.emit(packet)
	if packet.get("type")=="room" and intent.get("type") in ["create","join","resume"]:intent={}
func send(packet: Dictionary) -> bool:
	if not connected or not ready_handshake or socket==null or socket.get_ready_state()!=WebSocketPeer.STATE_OPEN: return false
	var body := packet.duplicate(true)
	body.build=BUILD.build
	return socket.send_text(JSON.stringify(body))==OK
func act(action: String, target: String) -> void:
	if pending_action: return
	pending_action=send({"type":"action","seq":room.get("seq",0),"actionId":action,"targetId":target})
func own_player() -> Dictionary:
	var players: Array=room.get("players",[])
	var seat: int=int(session.get("seat",-1))
	return players[seat] if seat>=0 and seat<players.size() and players[seat] is Dictionary else {}
func available() -> bool:
	return connected and room.get("phase")=="playing" and room.get("players",[]).all(func(p):return p is Dictionary and p.get("connected",false))
func disconnect_server() -> void:
	manual=true
	connected=false
	pending_action=false
	if socket!=null: socket.close()
	socket=null
	room={}
	session={}
	_save()
	connection_changed.emit()
func leave() -> void:
	manual=true
	if not send({"type":"leave"}): disconnect_server()
