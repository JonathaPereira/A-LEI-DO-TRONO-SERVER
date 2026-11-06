shader_type canvas_item;
uniform sampler2D screen_texture : hint_screen_texture, filter_linear;
uniform float progress=1.0;
uniform float strength=0.1;
uniform vec2 focus=vec2(0.5);
uniform vec4 tint : source_color=vec4(0.5,0.8,1.0,1.0);
void fragment(){
    vec2 delta=UV-focus;
    float radius=length(delta*vec2(1.0,0.6));
    float wave=exp(-pow((radius-progress*0.65)*24.0,2.0))*(1.0-progress);
    vec2 push=normalize(delta+vec2(0.0001))*wave*strength*0.014;
    float kick=pow(max(0.0,1.0-progress*4.0),2.0);
    vec2 jitter=vec2(sin(progress*131.0),cos(progress*97.0))*kick*strength*.012;
    vec3 c=texture(screen_texture,SCREEN_UV+push+jitter).rgb;
    c.r=texture(screen_texture,SCREEN_UV+push*1.45+jitter).r;
    c.b=texture(screen_texture,SCREEN_UV+push*0.65+jitter).b;
    float contact=exp(-radius*8.0)*pow(1.0-progress,5.0)*strength;
    c+=tint.rgb*contact;
    COLOR=vec4(c,1.0);
}
