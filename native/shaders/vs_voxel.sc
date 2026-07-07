$input a_position, a_normal, a_texcoord0, a_color0
$output v_normal, v_texcoord0, v_color0, v_world

#include <bgfx_shader.sh>

void main()
{
    vec4 world = mul(u_model[0], vec4(a_position, 1.0));
    v_world = world.xyz;
    v_normal = mul(u_model[0], vec4(a_normal, 0.0)).xyz;
    v_texcoord0 = a_texcoord0;
    v_color0 = a_color0;
    gl_Position = mul(u_modelViewProj, vec4(a_position, 1.0));
}
