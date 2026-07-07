$input v_normal, v_texcoord0, v_color0, v_world

#include <bgfx_shader.sh>

SAMPLER2D(s_tex, 0);

uniform vec4 u_lightPosRadius;
uniform vec4 u_lightColor;
uniform vec4 u_shadowParams;

void main()
{
    vec3 normal = normalize(v_normal);
    vec3 toLight = u_lightPosRadius.xyz - v_world;
    float distanceToLight = length(toLight);
    vec3 lightDir = toLight / max(distanceToLight, 0.0001);
    float attenuation = clamp(1.0 - distanceToLight / max(u_lightPosRadius.w, 0.0001), 0.0, 1.0);
    attenuation *= attenuation;
    float diffuse = max(dot(normal, lightDir), 0.0);
    float ambient = 0.18;
    vec4 texel = texture2D(s_tex, v_texcoord0);
    vec3 lit = texel.rgb * v_color0.rgb * (ambient + diffuse * attenuation * u_lightColor.rgb * 1.8);
    gl_FragColor = vec4(lit, texel.a * v_color0.a);
}
