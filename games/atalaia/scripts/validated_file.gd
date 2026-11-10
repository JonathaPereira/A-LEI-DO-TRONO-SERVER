extends RefCounted
## One file owner for validated JSON v1 documents, backup rotation and recovery.
## Domain adapters supply validation; loading never replaces unreadable source bytes.
var path: String
var error_text := ""
var _validator: Callable

func _init(save_path: String, document_validator: Callable = Callable()):
 path=save_path
 _validator=document_validator

func _valid(data: Variant) -> bool:
 return _validator.is_valid() and _validator.call(data)==true

func _read_document(file_path: String) -> Dictionary:
 if not FileAccess.file_exists(file_path): return {}
 var source = FileAccess.open(file_path, FileAccess.READ)
 if source == null: return {}
 var parser = JSON.new()
 var text = source.get_as_text()
 var read_error = source.get_error()
 source.close()
 if read_error != OK or parser.parse(text) != OK or not parser.data is Dictionary: return {}
 return parser.data

func load_save() -> Dictionary:
 error_text = ""
 var primary = _read_document(path)
 if _valid(primary): return primary
 var version: Variant = primary.get("version")
 if (version is int or version is float) and version != 1:
  error_text = "Progresso de versão incompatível. O arquivo foi preservado; use uma versão compatível."
  return {}
 var backup = _read_document(path+".bak")
 if _valid(backup):
  error_text = "Progresso recuperado da cópia anterior. A última gravação pode ter sido perdida."
  return backup
 if FileAccess.file_exists(path):
  error_text = "O progresso não pôde ser lido. Uma nova gravação guardará uma cópia do original."
 elif FileAccess.file_exists(path+".bak"):
  error_text = "A cópia do progresso não pôde ser recuperada. Os arquivos foram preservados."
 return {}

func _backup_healthy(bytes: PackedByteArray) -> bool:
 var staged = path+".bak.tmp"
 var error = DirAccess.copy_absolute(ProjectSettings.globalize_path(path),ProjectSettings.globalize_path(staged))
 if error == OK and FileAccess.get_file_as_bytes(staged) != bytes: error = ERR_FILE_CORRUPT
 if error == OK: error = DirAccess.rename_absolute(ProjectSettings.globalize_path(staged),ProjectSettings.globalize_path(path+".bak"))
 if error != OK:
  error_text = "Não foi possível salvar: falha ao preservar a cópia anterior. O progresso original foi mantido."
  return false
 return true

func _preserve_invalid() -> bool:
 if not FileAccess.file_exists(path): return true
 var source = FileAccess.open(path, FileAccess.READ)
 if source == null:
  error_text = "Não foi possível salvar: o progresso anterior não pôde ser lido."
  return false
 var bytes = source.get_buffer(source.get_length())
 var read_error = source.get_error()
 source.close()
 if read_error != OK:
  error_text = "Não foi possível salvar: falha ao ler o progresso anterior."
  return false
 var parser = JSON.new()
 if parser.parse(bytes.get_string_from_utf8()) == OK:
  if parser.data is Dictionary:
   var version: Variant=parser.data.get("version")
   if (version is int or version is float) and version!=1:
    error_text="Progresso de versão incompatível. O arquivo foi preservado; use uma versão compatível."
    return false
  if _valid(parser.data): return _backup_healthy(bytes)
 var backup = path + ".invalid.bak"
 if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(backup)):
  error_text = "Não foi possível salvar: uma pasta impede preservar o progresso anterior."
  return false
 var suffix = 0
 while FileAccess.file_exists(backup) or DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(backup)):
  if FileAccess.file_exists(backup) and FileAccess.get_file_as_bytes(backup) == bytes: return true
  suffix += 1
  backup = path + ".invalid.bak.%d" % suffix
 var copy_error = DirAccess.copy_absolute(ProjectSettings.globalize_path(path), ProjectSettings.globalize_path(backup))
 if copy_error != OK or FileAccess.get_file_as_bytes(backup) != bytes:
  error_text = "Não foi possível salvar: a cópia do progresso anterior falhou."
  return false
 return true

func save(data: Dictionary) -> bool:
 error_text = ""
 if not _valid(data):
  error_text = "Não foi possível salvar: os dados são inválidos."
  return false
 var temporary = path + ".tmp"
 var file = FileAccess.open(temporary, FileAccess.WRITE)
 if file == null:
  error_text = "Não foi possível salvar: " + error_string(FileAccess.get_open_error())
  return false
 file.store_string(JSON.stringify(data))
 file.flush()
 var write_error = file.get_error()
 file.close()
 if write_error != OK:
  error_text = "Não foi possível salvar: " + error_string(write_error)
  return false
 if not _preserve_invalid(): return false
 var rename_error = DirAccess.rename_absolute(ProjectSettings.globalize_path(temporary), ProjectSettings.globalize_path(path))
 if rename_error != OK:
  error_text = "Não foi possível salvar: " + error_string(rename_error)
  return false
 return true
