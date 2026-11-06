shader_type canvas_item;
render_mode blend_add;
uniform vec4 region_rect=vec4(0.0,0.0,1.0,1.0);
uniform float progress=0.0;
uniform vec4 tint : source_color=vec4(1.0);
uniform float recolor=0.0;
void fragment(){
    vec2 local=(UV-region_rect.xy)/region_rect.zw;
    vec2 displaced=local;
    displaced.x+=sin(local.y*18.0-progress*7.0)*.009;
    displaced.y+=sin(local.x*21.0+progress*4.0)*.005;
    vec4 paint=texture(TEXTURE,region_rect.xy+clamp(displaced,vec2(.002),vec2(.998))*region_rect.zw);
    float value=max(paint.r,max(paint.g,paint.b));
    vec3 hue=mix(paint.rgb,tint.rgb*value,recolor);
    vec2 edges=smoothstep(vec2(0),vec2(.08),local)*(vec2(1)-smoothstep(vec2(.92),vec2(1),local));
    float envelope=smoothstep(0.0,.08,progress)*(1.0-smoothstep(.38,1.0,progress));
    COLOR=vec4(hue,paint.a*envelope*edges.x*edges.y*.28);
}
