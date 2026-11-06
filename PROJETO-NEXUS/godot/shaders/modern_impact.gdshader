shader_type canvas_item;
render_mode blend_add;
uniform float progress=0.0;
uniform int profile=0;
uniform int phase=2;
uniform float seed=0.0;
uniform vec4 tint : source_color=vec4(0.5,0.8,1.0,1.0);
uniform sampler2D noise_map : repeat_enable,filter_linear;
void fragment(){
    vec2 q=(UV-0.5)*2.0;
    float p=progress;
    float radius=length(q);
    float angle=atan(q.y,q.x);
    vec2 drift=q*.64+vec2(seed*.173,-p*.22);
    float n=texture(noise_map,drift).r*.7+texture(noise_map,drift*2.03).r*.3;
    float fade=(1.0-smoothstep(0.45,1.0,p))*smoothstep(0.0,0.045,p);
    float spread=0.18+p*0.66;
    float ring=exp(-pow((radius-spread)*22.0,2.0));
    float core=exp(-radius*radius*30.0)*(1.0-p);
    float shape=0.0;
    vec3 hue=tint.rgb;
    if(profile==0){
        vec2 a=vec2(q.x*0.85,q.y*1.6);
        float crescent=abs(length(a-vec2(0.0,0.21))-0.52);
        shape=exp(-crescent*90.0)*(1.0-smoothstep(0.16,0.95,abs(q.x)));
        shape+=exp(-abs(q.y+q.x*.42)*60.0)*exp(-q.x*q.x*4.0)*.5;
    }else if(profile==1){
        float plume=length(vec2(q.x*1.2,q.y*.85+0.12));
        shape=(1.0-smoothstep(0.05,0.75,plume+n*.36-p*.10))*smoothstep(0.2,0.8,n)*2.2;
        hue=mix(vec3(1.0,0.16,0.025),vec3(1.0,0.83,0.28),smoothstep(0.1,0.6,shape));
        shape+=ring*n*.45;
    }else if(profile==2){
        float rippled=radius+sin(angle*9.0+p*8.0)*.025+n*.07;
        shape=exp(-pow((rippled-spread)*23.0,2.0))*(.4+n);
        shape+=exp(-pow((radius-spread*.68)*34.0,2.0))*.35;
        hue=mix(vec3(0.08,0.60,0.80),vec3(0.70,1.0,1.0),n);
    }else if(profile==3){
        shape=ring*pow(max(0.0,sin(angle*5.0+p)),4.0)+core*.6;
        shape+=smoothstep(.62,.85,n)*exp(-radius*3.0)*1.3;
    }else if(profile==4){
        float fork=sin(q.x*23.0+sin(q.x*11.0+p*19.0)*2.0)*.05;
        shape=exp(-abs(q.y-fork)*85.0)*exp(-q.x*q.x*2.0)+ring*.3;
        shape+=core;
    }else if(profile==5){
        float spiral=sin(angle*3.0-radius*15.0+p*9.0);
        shape=pow(max(0.0,spiral),10.0)*exp(-radius*3.5)+ring*n*.6;
        hue=mix(tint.rgb,vec3(.85,.65,1.0),n*.6);
    }else if(profile==6){
        float facet=cos(floor((angle+3.14159)/1.0472)*1.0472-angle+0.5236);
        shape=exp(-pow((radius*facet-(.48+p*.12))*55.0,2.0))*.8+core*.2;
        hue=vec3(.30,.76,1.0);
    }else{
        shape=exp(-pow((radius-spread)*27.0,2.0))*.4+exp(-radius*radius*8.0)*n*.65;
        hue=vec3(.35,1.0,.70);
    }
    if(phase==0){shape=ring*.35+core*.3+pow(max(0.0,sin(angle*4.0+p*10.0)),16.0)*exp(-pow((radius-.4)*10.0,2.0))*.6;fade=smoothstep(0.0,.15,p)*(1.0-smoothstep(.85,1.0,p));}
    if(phase==1){shape=(exp(-dot(q*vec2(.8,1.8),q*vec2(.8,1.8))*8.0)+n*.2*exp(-radius*4.0));}
    float edge=1.0-smoothstep(.84,1.0,radius);
    float intensity=max(shape,0.0)*fade*edge;
    vec3 hot=mix(hue,hue*.3+vec3(1.0)*.7,clamp(core*1.2,0.0,.7));
    COLOR=vec4(hot*1.12,intensity*.78);
}
