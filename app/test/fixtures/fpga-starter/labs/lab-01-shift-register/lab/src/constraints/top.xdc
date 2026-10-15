## Lab 1 & 2 — example constraints (check the pin names against your board's master XDC!)
## Clock
set_property -dict { PACKAGE_PIN <CLK_PIN> IOSTANDARD LVCMOS18 } [get_ports sysclk]
create_clock -period 10.000 -name sysclk [get_ports sysclk]
## Push button and switch
set_property -dict { PACKAGE_PIN <BTN0_PIN> IOSTANDARD LVCMOS18 } [get_ports btn]
set_property -dict { PACKAGE_PIN <SW0_PIN>  IOSTANDARD LVCMOS18 } [get_ports d_in]
## LEDs
set_property -dict { PACKAGE_PIN <LED0_PIN> IOSTANDARD LVCMOS18 } [get_ports {q[0]}]
set_property -dict { PACKAGE_PIN <LED1_PIN> IOSTANDARD LVCMOS18 } [get_ports {q[1]}]
set_property -dict { PACKAGE_PIN <LED2_PIN> IOSTANDARD LVCMOS18 } [get_ports {q[2]}]
set_property -dict { PACKAGE_PIN <LED3_PIN> IOSTANDARD LVCMOS18 } [get_ports {q[3]}]
