$input v_world

#include <bgfx_shader.sh>

uniform vec4 u_lightPosRadius;

void main()
{
    float depth = length(v_world - u_lightPosRadius.xyz) / max(u_lightPosRadius.w, 0.0001);
    gl_FragColor = vec4(depth, depth, depth, 1.0);
}
