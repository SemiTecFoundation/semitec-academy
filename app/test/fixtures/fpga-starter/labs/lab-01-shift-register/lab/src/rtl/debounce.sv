// debounce.sv — accepts a new button level only after it was stable for STABLE_CYCLES clocks
module debounce #(
  parameter int STABLE_CYCLES = 1_000_000   // 10 ms at 100 MHz
) (
  input  logic clk,
  input  logic btn_in,      // raw button (asynchronous)
  output logic btn_out      // clean level
);
  logic [1:0] sync;         // two flip-flop synchroniser
  logic [$clog2(STABLE_CYCLES)-1:0] cnt;

  always_ff @(posedge clk) begin
    sync <= {sync[0], btn_in};
    if (sync[1] == btn_out) cnt <= '0;
    else if (cnt == STABLE_CYCLES - 1) begin
      btn_out <= sync[1];
      cnt     <= '0;
    end else cnt <= cnt + 1;
  end
endmodule
