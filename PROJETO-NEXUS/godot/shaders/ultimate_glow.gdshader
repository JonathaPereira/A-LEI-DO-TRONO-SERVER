shader_type canvas_item;
render_mode blend_add;
uniform vec4 region_rect = vec4(0.0, 0.0, 1.0, 1.0);
uniform float progress = 0.0;
uniform bool vortex = false;

void fragment() {
    vec2 local_uv = (UV - region_rect.xy) / region_rect.zw;
    vec2 centered = local_uv - vec2(0.5);
    if (vortex) {
        float angle = (1.0 - progress) * 0.3;
        centered = mat2(vec2(cos(angle), sin(angle)), vec2(-sin(angle), cos(angle))) * centered;
        local_uv = centered + vec2(0.5);
    }
    local_uv.x += sin(local_uv.y * 22.0 - TIME * 7.0) * 0.009 * (1.0 - progress);
    local_uv.y += sin(local_uv.x * 15.0 + TIME * 4.0) * 0.005;
    vec2 sample_uv = region_rect.xy + clamp(local_uv, vec2(0.005), vec2(0.995)) * region_rect.zw;
    vec4 effect = texture(TEXTURE, sample_uv);
    float envelope = smoothstep(0.0, 0.10, progress) * (1.0 - smoothstep(0.58, 1.0, progress));
    vec2 edge = smoothstep(vec2(0.0), vec2(0.045), local_uv) * (vec2(1.0) - smoothstep(vec2(0.955), vec2(1.0), local_uv));
    COLOR = vec4(effect.rgb * 1.12, effect.a * envelope * edge.x * edge.y * 0.92);
}
