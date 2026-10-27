extends Node2D
var board: Node2D
func _process(_dt):queue_redraw()
func _draw():
 if is_instance_valid(board):board.draw_smoke(self)
