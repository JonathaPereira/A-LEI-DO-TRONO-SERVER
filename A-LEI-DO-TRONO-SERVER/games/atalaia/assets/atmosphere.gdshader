shader_type canvas_item;
uniform float wet = 1.0;
void fragment(){
 vec4 source=texture(TEXTURE,UV);
 float water=smoothstep(0.91,0.99,UV.y)+ (1.0-smoothstep(0.05,0.22,UV.x))*(1.0-smoothstep(0.04,0.18,UV.y));
 float ripple=sin(UV.x*340.0+TIME*1.4+sin(UV.y*200.0+TIME)*2.0)*sin(UV.y*360.0+TIME*1.8);
 float fog=(sin(UV.x*9.0+TIME*0.08+sin(UV.y*11.0))+sin(UV.y*13.0-TIME*0.1+UV.x*5.0))*0.012;
 vec3 grade=source.rgb*vec3(0.93,1.0,1.04);
 grade+=vec3(0.25,0.55,0.6)*max(0.0,ripple)*water*0.10*wet;
 grade+=vec3(0.3,0.5,0.57)*max(0.0,fog);
 float edge=pow(abs(UV.x-0.5)*2.0,5.0)+pow(abs(UV.y-0.5)*2.0,5.0);
 COLOR=vec4(grade*(1.0-edge*0.14),source.a);
}
