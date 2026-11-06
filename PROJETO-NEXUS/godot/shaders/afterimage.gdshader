shader_type canvas_item;
render_mode blend_add;
uniform vec4 spectral_color : source_color = vec4(0.3, 0.8, 1.0, 1.0);
uniform vec4 excluded_regions[8];
uniform int exclusion_count = 0;
void fragment() {
    vec2 pixel = UV * vec2(textureSize(TEXTURE, 0));
    for (int i = 0; i < exclusion_count; i++) {
        vec4 region = excluded_regions[i];
        if (all(greaterThanEqual(pixel, region.xy)) && all(lessThan(pixel, region.xy + region.zw))) discard;
    }
    float alpha = texture(TEXTURE, UV).a;
    COLOR = vec4(spectral_color.rgb, smoothstep(0.05, 0.8, alpha) * COLOR.a * spectral_color.a);
}
