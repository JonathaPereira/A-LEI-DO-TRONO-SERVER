shader_type canvas_item;
uniform float bend = 0.0;
uniform float sprite_height = 244.0;
uniform float flash = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0);
uniform vec4 excluded_regions[8];
uniform int exclusion_count = 0;
varying vec4 item_tint;
void vertex() {
    item_tint = COLOR;
    float height_factor = 1.0 - clamp(VERTEX.y / sprite_height, 0.0, 1.0);
    VERTEX.x += bend * height_factor * height_factor;
}
void fragment() {
    vec2 pixel = UV * vec2(textureSize(TEXTURE, 0));
    for (int i = 0; i < exclusion_count; i++) {
        vec4 region = excluded_regions[i];
        if (all(greaterThanEqual(pixel, region.xy)) && all(lessThan(pixel, region.xy + region.zw))) discard;
    }
    vec4 sampled = texture(TEXTURE, UV);
    float silhouette = smoothstep(0.08, 0.78, sampled.a);
    vec3 lit = mix(sampled.rgb, flash_color.rgb, flash * 0.65);
    COLOR = vec4(lit, silhouette) * item_tint;
}
