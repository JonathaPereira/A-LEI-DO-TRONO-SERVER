shader_type canvas_item;
uniform float clock = 0.0;
uniform int theme_kind = 0;
uniform vec4 accent : source_color = vec4(0.4,0.8,1.0,1.0);
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void fragment(){
    vec2 uv=UV;
    float distant=1.0-smoothstep(0.22,0.43,uv.y);
    uv.x+=sin(clock*0.16+uv.y*8.0)*0.0013*distant;
    if(theme_kind==1){uv.x+=sin(uv.y*85.0-clock*1.4)*0.0011*smoothstep(0.7,1.0,abs(uv.x-0.5)*2.0);}
    if(theme_kind==2){uv.y+=sin(uv.x*45.0+clock*1.7)*0.0012*distant;}
    vec3 base=texture(TEXTURE,clamp(uv,vec2(0.001),vec2(0.999))).rgb;
    float fog=noise(vec2(UV.x*4.0-clock*0.035,UV.y*9.0+clock*0.012));
    float mist=smoothstep(0.44,0.82,fog)*(1.0-smoothstep(0.12,0.53,abs(UV.y-0.36)));
    base=mix(base,accent.rgb*0.55,mist*0.14);
    float rays=pow(max(0.0,sin(UV.x*19.0+UV.y*5.0+clock*0.09)),14.0)*distant;
    base+=accent.rgb*rays*0.035;
    if(theme_kind==1){
        float water=smoothstep(0.74,0.96,abs(UV.x-0.5)*2.0)*smoothstep(0.33,0.52,UV.y);
        float caustic=pow(max(0.0,sin(UV.x*82.0+sin(UV.y*65.0-clock)*2.0+clock*0.7)),10.0);
        base+=vec3(0.13,0.62,0.70)*caustic*water*0.12;
    }
    if(theme_kind==2){base+=vec3(0.22,0.065,0.012)*(sin(clock*1.3)*0.5+0.5)*distant*0.12;}
    float vignette=1.0-smoothstep(0.32,0.85,length((UV-0.5)*vec2(1.0,0.65)));
    COLOR=vec4(base*(0.79+vignette*0.19),1.0);
}
